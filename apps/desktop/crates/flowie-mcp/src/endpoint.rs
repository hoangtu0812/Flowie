//! Endpoint validation, kept identical to the rules the Python runner applies
//! in `scripts/flowie_runner/config.py`. The checks exist because a mistyped
//! endpoint must fail at configuration time with a clear reason, not later as
//! a confusing authentication error, and because a URL carrying credentials or
//! a query string would put secrets into logs and proxies.
//! VI: Kiểm tra endpoint, giữ giống hệt quy tắc runner Python áp dụng trong
//! VI: `scripts/flowie_runner/config.py`. Các kiểm tra này tồn tại vì endpoint
//! VI: gõ sai phải hỏng ngay lúc cấu hình với lý do rõ ràng, chứ không phải
//! VI: hỏng về sau dưới dạng một lỗi xác thực khó hiểu, và vì URL mang
//! VI: credential hay query string sẽ đưa bí mật vào log và proxy.

use crate::error::{Error, Result};

/// A validated Flowie MCP endpoint.
/// VI: Một endpoint MCP Flowie đã được kiểm tra.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Endpoint(String);

impl Endpoint {
    pub fn parse(raw: &str) -> Result<Self> {
        let url = url_parts(raw)?;

        // Loopback is allowed over plain HTTP so a developer can run the
        // server locally; everything else must be HTTPS.
        // VI: Loopback được dùng HTTP thuần để lập trình viên chạy server tại
        // VI: máy; mọi trường hợp khác bắt buộc HTTPS.
        let loopback =
            matches!(url.host.as_str(), "localhost" | "127.0.0.1") && url.scheme == "http";
        if url.scheme != "https" && !loopback {
            return Err(Error::Endpoint(
                "use a credential-free HTTPS URL (loopback may use HTTP)".into(),
            ));
        }
        if url.host.is_empty() {
            return Err(Error::Endpoint("the URL has no host".into()));
        }
        if url.has_credentials {
            return Err(Error::Endpoint(
                "the URL must not carry a username or password".into(),
            ));
        }
        if url.has_query_or_fragment {
            return Err(Error::Endpoint(
                "the URL must not carry a query or fragment".into(),
            ));
        }
        if !url.path.ends_with("/mcp/") {
            return Err(Error::Endpoint("the path must end with /mcp/".into()));
        }
        Ok(Self(raw.to_string()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

struct Parts {
    scheme: String,
    host: String,
    path: String,
    has_credentials: bool,
    has_query_or_fragment: bool,
}

/// Splits a URL far enough to apply the rules above. A dependency-free parse
/// keeps the crate's public contract from shifting when a URL library changes
/// how it normalises an input.
/// VI: Tách URL vừa đủ để áp dụng các quy tắc trên. Tự phân tích, không phụ
/// VI: thuộc thư viện, giúp hợp đồng của crate không đổi theo cách một thư
/// VI: viện URL chuẩn hoá đầu vào.
fn url_parts(raw: &str) -> Result<Parts> {
    let (scheme, rest) = raw
        .split_once("://")
        .ok_or_else(|| Error::Endpoint("the URL has no scheme".into()))?;
    if rest.is_empty() {
        return Err(Error::Endpoint("the URL has no host".into()));
    }
    let (authority, path) = match rest.find('/') {
        Some(index) => (&rest[..index], &rest[index..]),
        None => (rest, ""),
    };
    let has_credentials = authority.contains('@');
    let host = authority
        .rsplit('@')
        .next()
        .unwrap_or_default()
        .split(':')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    Ok(Parts {
        scheme: scheme.to_ascii_lowercase(),
        host,
        path: path.to_string(),
        has_credentials,
        has_query_or_fragment: path.contains('?') || path.contains('#'),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_the_documented_shapes() {
        assert!(Endpoint::parse("https://flowie.loopstudio.io.vn/mcp/").is_ok());
        assert!(Endpoint::parse("http://localhost:4000/mcp/").is_ok());
        assert!(Endpoint::parse("http://127.0.0.1:4000/api/v1/mcp/").is_ok());
    }

    #[test]
    fn rejects_plain_http_off_loopback() {
        assert!(matches!(
            Endpoint::parse("http://flowie.example.com/mcp/"),
            Err(Error::Endpoint(_))
        ));
    }

    #[test]
    fn rejects_credentials_in_the_url() {
        assert!(matches!(
            Endpoint::parse("https://user:secret@flowie.example.com/mcp/"),
            Err(Error::Endpoint(_))
        ));
    }

    #[test]
    fn rejects_a_query_or_fragment() {
        assert!(matches!(
            Endpoint::parse("https://flowie.example.com/mcp/?token=abc"),
            Err(Error::Endpoint(_))
        ));
        assert!(matches!(
            Endpoint::parse("https://flowie.example.com/mcp/#frag"),
            Err(Error::Endpoint(_))
        ));
    }

    #[test]
    fn rejects_a_path_that_is_not_the_mcp_endpoint() {
        assert!(matches!(
            Endpoint::parse("https://flowie.example.com/"),
            Err(Error::Endpoint(_))
        ));
        // A path that merely contains the segment is not the endpoint either.
        // VI: Path chỉ chứa đoạn đó ở giữa cũng không phải endpoint.
        assert!(matches!(
            Endpoint::parse("https://flowie.example.com/mcp/v2"),
            Err(Error::Endpoint(_))
        ));
    }

    #[test]
    fn rejects_input_that_is_not_a_url() {
        assert!(matches!(Endpoint::parse(""), Err(Error::Endpoint(_))));
        assert!(matches!(
            Endpoint::parse("flowie.example.com/mcp/"),
            Err(Error::Endpoint(_))
        ));
        assert!(matches!(
            Endpoint::parse("https://"),
            Err(Error::Endpoint(_))
        ));
    }
}
