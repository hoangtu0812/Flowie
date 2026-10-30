from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.errors import ApiError
from app.modules.mcp.log_redaction import MAX_JSON, failure_details, redact_arguments


class McpLogRedactionTests(unittest.TestCase):
    def test_credentials_are_masked_by_name_and_value(self):
        copy = redact_arguments(
            {
                "issueId": "DTD-1",
                "idempotencyKey": "retry-key-1",
                "accessToken": "abc",
                "Authorization": "Bearer abc",
                "teamsWebhookUrl": "https://example.test/hook",
                "nested": {"client_secret": "x", "api-key": "y"},
                "content": "Use Bearer abc.def and flowie_mcp_Zz-9 at "
                "https://prod.westus.logic.azure.com/workflows/1/triggers?sig=SECRET now",
            }
        )
        encoded = json.dumps(copy)
        for leaked in ["abc.def", "flowie_mcp_Zz", "SECRET", "workflows/1", "example.test/hook"]:
            self.assertNotIn(leaked, encoded)
        self.assertEqual(copy["issueId"], "DTD-1")
        self.assertEqual(copy["idempotencyKey"], "retry-key-1")
        self.assertEqual(copy["accessToken"], "[redacted]")
        self.assertEqual(copy["nested"], {"client_secret": "[redacted]", "api-key": "[redacted]"})
        self.assertIn("https://prod.westus.logic.azure.com/…", copy["content"])

    def test_copy_is_bounded(self):
        copy = redact_arguments(
            {
                "text": "x" * 500,
                "items": list(range(25)),
                "deep": {"a": {"b": {"c": {"d": 1}}}},
                **{f"k{index}": index for index in range(40)},
            }
        )
        self.assertEqual(len(copy["text"]), 201)
        self.assertEqual(copy["items"][-1], "… 15 more")
        self.assertEqual(copy["deep"], {"a": {"b": {"c": "[nested]"}}})
        self.assertEqual(len(copy), 31)
        huge = redact_arguments({f"k{index}": "y" * 300 for index in range(30)})
        self.assertIsInstance(huge, str)
        self.assertEqual(len(huge), MAX_JSON + 1)

    def test_failure_details_hide_internal_errors(self):
        self.assertEqual(
            failure_details(ApiError(403, "Forbidden scope.", "Forbidden")),
            {"statusCode": 403, "error": "Forbidden", "message": "Forbidden scope."},
        )
        self.assertEqual(failure_details(TimeoutError())["statusCode"], 504)
        internal = failure_details(RuntimeError("SELECT secret FROM users"))
        self.assertEqual(
            internal,
            {"statusCode": 500, "error": "RuntimeError", "message": "Tool execution failed."},
        )


if __name__ == "__main__":
    unittest.main()
