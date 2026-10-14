import asyncio
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
import ipaddress
import os
import socketserver
import ssl
from threading import Thread
from urllib.parse import urlsplit
from uuid import uuid4
from unittest.mock import patch

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
import pytest

from app.core.config import Settings
from app.services.private_email import send_private_email
from app.storage.minio import MinioStorage


@pytest.mark.skipif(
    not os.getenv("S3_TEST_ENDPOINT"),
    reason="Isolated S3/MinIO acceptance endpoint is not configured",
)
def test_real_s3_signing_binary_unicode_keys_and_cleanup():
    async def run():
        endpoint = os.environ["S3_TEST_ENDPOINT"]
        if urlsplit(endpoint).hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError(
                "Storage acceptance only writes to an isolated loopback server."
            )
        settings = replace(
            Settings.from_environment(),
            s3_endpoint=endpoint,
            s3_access_key="minioadmin",
            s3_secret_key="minioadmin123",
            s3_bucket="flowie-acceptance-" + uuid4().hex,
        )
        storage = MinioStorage(settings)
        key, body = "fixture/tài liệu % #.bin", bytes(range(256))
        try:
            await storage.put(key, body, "application/octet-stream")
            assert await MinioStorage(settings).get(key) == body
            await storage.put(key, b"updated", "text/plain")
            assert await storage.get(key) == b"updated"
        finally:
            await storage._request(
                "DELETE", f"/{storage.bucket}/{storage._escape_key(key)}"
            )
            await storage._request("DELETE", f"/{storage.bucket}")

    asyncio.run(run())


@pytest.mark.parametrize("implicit_tls", [False, True])
def test_private_smtp_delivers_only_after_verified_tls(tmp_path, implicit_tls):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    now = datetime.now(timezone.utc)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=1))
        .not_valid_after(now + timedelta(hours=1))
        .add_extension(
            x509.SubjectAlternativeName(
                [
                    x509.DNSName("localhost"),
                    x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
                ]
            ),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    cert_path, key_path = tmp_path / "cert.pem", tmp_path / "key.pem"
    cert_path.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    server_context.load_cert_chain(cert_path, key_path)
    client_context = ssl.create_default_context(cafile=str(cert_path))
    delivered = []

    class SMTPHandler(socketserver.BaseRequestHandler):
        def handle(self):
            connection = self.request
            connection.settimeout(5)
            secure = implicit_tls
            if implicit_tls:
                connection = server_context.wrap_socket(connection, server_side=True)
            reader = connection.makefile("rb")

            def reply(message):
                connection.sendall(message.encode("ascii") + b"\r\n")

            reply("220 fixture SMTP")
            try:
                while True:
                    line = reader.readline().decode("ascii", errors="replace").strip()
                    if not line:
                        break
                    command = line.split(" ", 1)[0].upper()
                    if command in {"EHLO", "HELO"}:
                        reply(
                            "250-fixture\r\n250 STARTTLS"
                            if not secure
                            else "250 fixture"
                        )
                    elif command == "STARTTLS":
                        reply("220 Start TLS")
                        reader.close()
                        connection = server_context.wrap_socket(
                            connection, server_side=True
                        )
                        reader = connection.makefile("rb")
                        secure = True
                    elif command in {"MAIL", "RCPT"}:
                        assert secure
                        reply("250 OK")
                    elif command == "DATA":
                        assert secure
                        reply("354 End with dot")
                        data = []
                        while True:
                            part = reader.readline()
                            if part == b".\r\n":
                                break
                            if not part:
                                raise RuntimeError("Incomplete SMTP fixture data")
                            data.append(part)
                        delivered.append(b"".join(data))
                        reply("250 Accepted")
                    elif command == "QUIT":
                        reply("221 Bye")
                        break
                    else:
                        reply("250 OK")
            finally:
                reader.close()
                connection.close()

    class FixtureServer(socketserver.ThreadingTCPServer):
        daemon_threads = True

    with FixtureServer(("127.0.0.1", 0), SMTPHandler) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        settings = replace(
            Settings.from_environment(),
            smtp_host="127.0.0.1",
            smtp_port=server.server_address[1],
            smtp_username="",
            smtp_use_ssl=implicit_tls,
        )
        message = EmailMessage()
        message["From"], message["To"], message["Subject"] = (
            "sender@example.test",
            "recipient@example.test",
            "Private fixture",
        )
        message.set_content("Synthetic local delivery")
        try:
            with patch(
                "app.services.private_email.ssl.create_default_context",
                return_value=client_context,
            ):
                asyncio.run(send_private_email(settings, message))
            assert len(delivered) == 1 and b"Synthetic local delivery" in delivered[0]
        finally:
            server.shutdown()
            thread.join(timeout=5)
