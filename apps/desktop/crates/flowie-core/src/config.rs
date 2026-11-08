//! What this machine has been set up to do, and what it is allowed to run.
//!
//! The file holds the decisions a person made during onboarding: which Flowie
//! server, which project, which checkout on disk, which agent, and which test
//! commands they approved. It is read back on every start, because the
//! companion must behave the same after a restart as it did before one.
//! VI: Những gì máy này được thiết lập để làm, và những gì nó được phép chạy.
//! VI: File giữ các quyết định một người đã đưa ra lúc thiết lập: server Flowie
//! VI: nào, project nào, checkout nào trên đĩa, agent nào, và những lệnh test
//! VI: nào họ đã duyệt. Nó được đọc lại ở mỗi lần khởi động, vì companion phải
//! VI: hành xử sau khi khởi động lại giống như trước đó.
//!
//! **The token is not in here.** It lives in the operating system credential
//! store, and this type has no field that could hold it — a configuration
//! file gets copied into bug reports, synced to backups and read over
//! shoulders, and a bearer token that can claim runs and write to issues does
//! not belong in any of those.
//! VI: **Token không nằm ở đây.** Nó nằm trong kho credential của hệ điều
//! VI: hành, và kiểu dữ liệu này không có trường nào chứa được nó — file cấu
//! VI: hình bị copy vào báo cáo lỗi, đồng bộ lên backup và bị đọc lỏm, mà một
//! VI: bearer token claim được run và ghi được vào issue thì không thuộc về
//! VI: bất cứ nơi nào trong số đó.
//!
//! Unknown fields are rejected rather than ignored, matching the Python
//! runner. A typo in a key that is silently dropped is worse than an error:
//! the person believes they configured something they did not.
//! VI: Trường lạ bị từ chối chứ không bị bỏ qua, giống runner Python. Một key
//! VI: gõ sai mà bị âm thầm bỏ còn tệ hơn một lỗi: người dùng tin rằng họ đã
//! VI: cấu hình thứ mà thực ra họ chưa cấu hình.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{ConfigError, Result};

/// Which agent runs the work.
/// VI: Agent nào thực hiện công việc.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Claude,
    Codex,
}

impl Provider {
    pub fn program(self) -> &'static str {
        match self {
            Provider::Claude => "claude",
            Provider::Codex => "codex",
        }
    }

    /// The name to show a person, which is not the command name: someone
    /// reading the tray wants to know which agent is working on their task,
    /// and `claude` lowercase reads as a file rather than a product.
    /// VI: Tên hiển thị cho người đọc, khác tên lệnh: người nhìn tray muốn biết
    /// VI: agent nào đang làm task của họ, và `claude` viết thường đọc ra như một
    /// VI: file chứ không phải một sản phẩm.
    pub fn label(self) -> &'static str {
        match self {
            Provider::Claude => "Claude",
            Provider::Codex => "Codex",
        }
    }
}

/// One repository this machine may work in.
/// VI: Một repository mà máy này được phép làm việc trong đó.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RepositoryMapping {
    /// The project the server knows, which decides which runs belong here.
    /// VI: Project mà server biết, quyết định những run nào thuộc về đây.
    pub project_id: String,
    /// The repository as the server describes it. The checkout is verified
    /// against this before anything runs, so a wrong folder is refused rather
    /// than worked in.
    /// VI: Repository theo mô tả của server. Checkout được đối chiếu với giá
    /// VI: trị này trước khi chạy, nên thư mục sai bị từ chối chứ không bị
    /// VI: đem ra làm việc.
    pub repository_url: String,
    pub base_branch: String,
    /// The checkout on this machine.
    /// VI: Checkout trên máy này.
    pub path: PathBuf,
    /// Commands a person approved for this repository, as argument vectors.
    /// Nothing else is ever executed as a test.
    /// VI: Các lệnh một người đã duyệt cho repository này, dạng mảng argument.
    /// VI: Không có gì khác từng được chạy với tư cách test.
    pub approved_tests: Vec<Vec<String>>,
    /// Whether this machine may push a branch and open a pull request. Off
    /// means the work stops at a local commit.
    /// VI: Máy này có được push nhánh và mở pull request hay không. Tắt nghĩa
    /// VI: là công việc dừng ở một commit cục bộ.
    #[serde(default)]
    pub may_publish: bool,
}

/// Everything this companion was set up with.
/// VI: Toàn bộ thiết lập của companion này.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CompanionConfig {
    /// The Flowie MCP endpoint.
    /// VI: Endpoint MCP của Flowie.
    pub endpoint: String,
    /// Names the credential entry holding this endpoint's token, so a machine
    /// that talks to two Flowie servers keeps two tokens apart instead of
    /// silently sending one to the other.
    /// VI: Đặt tên mục credential giữ token của endpoint này, để một máy nói
    /// VI: chuyện với hai server Flowie giữ hai token tách biệt thay vì âm thầm
    /// VI: gửi token của bên này sang bên kia.
    pub credential_account: String,
    pub provider: Provider,
    pub repositories: Vec<RepositoryMapping>,
    /// How long to wait between asking for queued work. Short enough that a
    /// person does not wait, long enough that many machines do not flood the
    /// server.
    /// VI: Khoảng chờ giữa hai lần hỏi việc. Đủ ngắn để người dùng không phải
    /// VI: đợi, đủ dài để nhiều máy không dồn tải lên server.
    #[serde(default = "default_poll_seconds")]
    pub poll_seconds: u64,
    /// Whether the companion picks up new work at all. A paused companion
    /// finishes what it is doing and takes nothing new.
    /// VI: Companion có nhận việc mới hay không. Companion đang tạm dừng vẫn
    /// VI: làm nốt việc hiện tại và không nhận thêm.
    #[serde(default)]
    pub paused: bool,
    /// Whether the companion starts when the person signs in.
    ///
    /// Off unless someone turns it on. A task runner that appears at
    /// sign-in without being asked is a program taking a decision that
    /// belongs to whoever owns the machine, and it would start claiming
    /// work before they knew it was running.
    /// VI: Companion có khởi động cùng lúc người dùng đăng nhập hay không.
    /// VI: Mặc định tắt trừ khi có người bật. Một chương trình nhận việc tự hiện
    /// VI: ra lúc đăng nhập mà không ai yêu cầu là chương trình tự quyết một việc
    /// VI: thuộc về chủ máy, và nó sẽ bắt đầu nhận task trước khi họ biết nó đang
    /// VI: chạy.
    #[serde(default)]
    pub start_at_login: bool,
}

fn default_poll_seconds() -> u64 {
    10
}

const POLL_MIN: u64 = 5;
const POLL_MAX: u64 = 300;
const TESTS_MAX: usize = 20;

impl CompanionConfig {
    /// Checks everything that can be checked without touching the network or
    /// the disk. Called on load and before save, so a file on disk is always
    /// one the companion would accept.
    /// VI: Kiểm mọi thứ kiểm được mà không đụng tới mạng hay đĩa. Gọi lúc nạp
    /// VI: và trước khi lưu, nên file trên đĩa luôn là file companion chấp nhận.
    pub fn validate(&self) -> Result<()> {
        flowie_mcp::Endpoint::parse(&self.endpoint)
            .map_err(|error| ConfigError::Invalid(error.to_string()))?;

        if self.credential_account.trim().is_empty() {
            return Err(ConfigError::Invalid(
                "the credential account must not be empty".into(),
            ));
        }
        if !(POLL_MIN..=POLL_MAX).contains(&self.poll_seconds) {
            return Err(ConfigError::Invalid(format!(
                "poll_seconds must be between {POLL_MIN} and {POLL_MAX}"
            )));
        }
        if self.repositories.is_empty() {
            return Err(ConfigError::Invalid(
                "configure at least one repository".into(),
            ));
        }

        let mut seen: Vec<&str> = Vec::new();
        for repository in &self.repositories {
            repository.validate()?;
            // Two mappings for one project would make which checkout a run
            // lands in depend on ordering, which is not a decision anyone
            // made.
            // VI: Hai ánh xạ cho cùng một project sẽ khiến run rơi vào checkout
            // nào phụ thuộc thứ tự, và đó không phải quyết định của ai cả.
            if seen.contains(&repository.project_id.as_str()) {
                return Err(ConfigError::Invalid(format!(
                    "project {} is mapped twice",
                    repository.project_id
                )));
            }
            seen.push(&repository.project_id);
        }
        Ok(())
    }

    /// Where the configuration lives inside the companion's data directory.
    /// VI: Nơi cấu hình nằm trong thư mục dữ liệu của companion.
    pub fn path_in(directory: &Path) -> PathBuf {
        directory.join("companion.json")
    }

    /// Reads and validates. A file that fails validation is reported rather
    /// than repaired: silently correcting someone's configuration means the
    /// companion runs against something they did not choose.
    /// VI: Đọc và kiểm tra. File không hợp lệ thì được báo chứ không tự sửa:
    /// VI: âm thầm sửa cấu hình của ai đó nghĩa là companion chạy theo thứ họ
    /// VI: không chọn.
    pub fn load(directory: &Path) -> Result<Self> {
        let path = Self::path_in(directory);
        let text = match std::fs::read_to_string(&path) {
            Ok(text) => text,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Err(ConfigError::NotConfigured)
            }
            Err(error) => {
                return Err(ConfigError::Unreadable {
                    path,
                    message: error.to_string(),
                })
            }
        };
        let config: Self = serde_json::from_str(&text).map_err(|error| ConfigError::Malformed {
            path: path.clone(),
            message: error.to_string(),
        })?;
        config.validate()?;
        Ok(config)
    }

    /// Validates, then writes. Writing through a temporary file and renaming
    /// means a crash mid-write leaves the previous configuration intact
    /// instead of a truncated file the companion would refuse to start with.
    /// VI: Kiểm tra, rồi mới ghi. Ghi qua file tạm rồi đổi tên giúp một lần
    /// VI: crash giữa chừng để lại cấu hình cũ nguyên vẹn, thay vì một file bị
    /// VI: cắt dở mà companion sẽ từ chối khởi động cùng.
    pub fn save(&self, directory: &Path) -> Result<()> {
        self.validate()?;
        std::fs::create_dir_all(directory).map_err(|error| ConfigError::Unreadable {
            path: directory.to_path_buf(),
            message: error.to_string(),
        })?;
        let path = Self::path_in(directory);
        let temporary = path.with_extension("json.tmp");
        let text = serde_json::to_string_pretty(self)
            .map_err(|error| ConfigError::Invalid(error.to_string()))?;
        std::fs::write(&temporary, text).map_err(|error| ConfigError::Unreadable {
            path: temporary.clone(),
            message: error.to_string(),
        })?;
        std::fs::rename(&temporary, &path).map_err(|error| ConfigError::Unreadable {
            path,
            message: error.to_string(),
        })
    }

    /// The mapping a run's project belongs to, if this machine has one.
    /// VI: Ánh xạ mà project của một run thuộc về, nếu máy này có.
    pub fn repository_for(&self, project_id: &str) -> Option<&RepositoryMapping> {
        self.repositories
            .iter()
            .find(|repository| repository.project_id == project_id)
    }
}

impl RepositoryMapping {
    pub fn validate(&self) -> Result<()> {
        if self.project_id.trim().is_empty() {
            return Err(ConfigError::Invalid("a mapping has no project".into()));
        }
        let url = self.repository_url.trim();
        if !url.starts_with("https://") || url.contains('@') || url.len() > 2048 {
            return Err(ConfigError::Invalid(format!(
                "{} needs a credential-free HTTPS repository URL",
                self.project_id
            )));
        }
        flowie_repository::git::validate_branch(&self.base_branch)
            .map_err(|error| ConfigError::Invalid(error.to_string()))?;
        if self.path.as_os_str().is_empty() || self.path.is_relative() {
            return Err(ConfigError::Invalid(format!(
                "{} needs an absolute checkout path",
                self.project_id
            )));
        }
        if self.approved_tests.is_empty() || self.approved_tests.len() > TESTS_MAX {
            return Err(ConfigError::Invalid(format!(
                "{} must approve 1 to {TESTS_MAX} test commands",
                self.project_id
            )));
        }
        for command in &self.approved_tests {
            if command.is_empty() || command.len() > 50 {
                return Err(ConfigError::Invalid(format!(
                    "{} has a test command with no program or too many arguments",
                    self.project_id
                )));
            }
            if command
                .iter()
                .any(|argument| argument.is_empty() || argument.len() > 2000)
            {
                return Err(ConfigError::Invalid(format!(
                    "{} has a test command with an unbounded argument",
                    self.project_id
                )));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mapping() -> RepositoryMapping {
        RepositoryMapping {
            project_id: "cproj1".into(),
            repository_url: "https://github.com/hoangtu0812/Flowie".into(),
            base_branch: "main".into(),
            path: if cfg!(windows) {
                PathBuf::from("C:\\code\\flowie")
            } else {
                PathBuf::from("/home/me/code/flowie")
            },
            approved_tests: vec![vec!["pnpm".into(), "test".into()]],
            may_publish: false,
        }
    }

    fn config() -> CompanionConfig {
        CompanionConfig {
            endpoint: "https://flowie.example.com/mcp/".into(),
            credential_account: "flowie.example.com".into(),
            provider: Provider::Claude,
            repositories: vec![mapping()],
            poll_seconds: 10,
            paused: false,
            start_at_login: false,
        }
    }

    #[test]
    fn a_complete_configuration_is_accepted() {
        assert!(config().validate().is_ok());
    }

    #[test]
    fn the_endpoint_rule_is_the_one_the_client_already_enforces() {
        let mut broken = config();
        broken.endpoint = "https://flowie.example.com/".into();
        assert!(matches!(broken.validate(), Err(ConfigError::Invalid(_))));

        broken.endpoint = "http://flowie.example.com/mcp/".into();
        assert!(matches!(broken.validate(), Err(ConfigError::Invalid(_))));
    }

    #[test]
    fn a_hostile_base_branch_is_refused_at_configuration_time() {
        let mut broken = config();
        broken.repositories[0].base_branch = "--upload-pack=touch owned".into();
        assert!(matches!(broken.validate(), Err(ConfigError::Invalid(_))));
    }

    #[test]
    fn a_repository_url_with_credentials_is_refused() {
        let mut broken = config();
        broken.repositories[0].repository_url = "https://user:pw@github.com/a/b".into();
        assert!(matches!(broken.validate(), Err(ConfigError::Invalid(_))));
    }

    #[test]
    fn a_relative_checkout_path_is_refused() {
        // A relative path would resolve against whatever directory the app
        // happened to start in, which is not a location anyone chose.
        // VI: Đường dẫn tương đối sẽ được phân giải theo thư mục mà ứng dụng
        // VI: tình cờ khởi động trong đó, không phải nơi ai đó đã chọn.
        let mut broken = config();
        broken.repositories[0].path = PathBuf::from("code/flowie");
        assert!(matches!(broken.validate(), Err(ConfigError::Invalid(_))));
    }

    #[test]
    fn test_commands_must_be_present_and_bounded() {
        let mut broken = config();
        broken.repositories[0].approved_tests = vec![];
        assert!(matches!(broken.validate(), Err(ConfigError::Invalid(_))));

        broken.repositories[0].approved_tests = vec![vec![]];
        assert!(matches!(broken.validate(), Err(ConfigError::Invalid(_))));

        broken.repositories[0].approved_tests = vec![vec!["pnpm".into(), String::new()]];
        assert!(matches!(broken.validate(), Err(ConfigError::Invalid(_))));
    }

    #[test]
    fn one_project_cannot_be_mapped_twice() {
        let mut broken = config();
        broken.repositories.push(mapping());
        assert!(matches!(broken.validate(), Err(ConfigError::Invalid(_))));
    }

    #[test]
    fn the_poll_interval_stays_within_bounds() {
        let mut broken = config();
        broken.poll_seconds = 1;
        assert!(matches!(broken.validate(), Err(ConfigError::Invalid(_))));
        broken.poll_seconds = 3_600;
        assert!(matches!(broken.validate(), Err(ConfigError::Invalid(_))));
    }

    #[test]
    fn a_configuration_survives_a_save_and_load() {
        let directory = tempfile::tempdir().unwrap();
        let original = config();
        original.save(directory.path()).unwrap();
        assert_eq!(CompanionConfig::load(directory.path()).unwrap(), original);
    }

    #[test]
    fn a_missing_file_is_not_configured_rather_than_an_error() {
        let directory = tempfile::tempdir().unwrap();
        assert!(matches!(
            CompanionConfig::load(directory.path()),
            Err(ConfigError::NotConfigured)
        ));
    }

    #[test]
    fn an_unknown_field_is_refused_rather_than_ignored() {
        // A typo that is silently dropped leaves the person believing they
        // configured something they did not.
        // VI: Một lỗi gõ bị âm thầm bỏ qua khiến người dùng tin rằng họ đã cấu
        // VI: hình thứ mà thực ra họ chưa.
        let directory = tempfile::tempdir().unwrap();
        config().save(directory.path()).unwrap();
        let path = CompanionConfig::path_in(directory.path());
        let text = std::fs::read_to_string(&path).unwrap();
        let tampered = text.replace("\"paused\"", "\"pasued\"");
        std::fs::write(&path, tampered).unwrap();
        assert!(matches!(
            CompanionConfig::load(directory.path()),
            Err(ConfigError::Malformed { .. })
        ));
    }

    #[test]
    fn an_invalid_file_on_disk_is_reported_not_repaired() {
        let directory = tempfile::tempdir().unwrap();
        let mut broken = config();
        broken.poll_seconds = 10;
        broken.save(directory.path()).unwrap();
        let path = CompanionConfig::path_in(directory.path());
        let text = std::fs::read_to_string(&path).unwrap();
        std::fs::write(
            &path,
            text.replace("\"poll_seconds\": 10", "\"poll_seconds\": 1"),
        )
        .unwrap();
        assert!(matches!(
            CompanionConfig::load(directory.path()),
            Err(ConfigError::Invalid(_))
        ));
    }

    #[test]
    fn saving_refuses_an_invalid_configuration_before_touching_the_disk() {
        let directory = tempfile::tempdir().unwrap();
        let mut broken = config();
        broken.repositories.clear();
        assert!(broken.save(directory.path()).is_err());
        assert!(!CompanionConfig::path_in(directory.path()).exists());
    }

    #[test]
    fn the_file_cannot_carry_a_token() {
        // The type has no field for one, so a round trip through JSON cannot
        // introduce it, and deny_unknown_fields stops anyone adding it by
        // hand and having it silently accepted.
        // VI: Kiểu dữ liệu không có trường nào cho token, nên một vòng JSON
        // VI: không thể đưa nó vào, và deny_unknown_fields chặn việc ai đó thêm
        // VI: bằng tay rồi được chấp nhận âm thầm.
        let directory = tempfile::tempdir().unwrap();
        config().save(directory.path()).unwrap();
        let text = std::fs::read_to_string(CompanionConfig::path_in(directory.path())).unwrap();
        let lowered = text.to_lowercase();
        assert!(!lowered.contains("token"));
        assert!(!lowered.contains("password"));
        assert!(!lowered.contains("secret"));

        let tampered = text.replace(
            "\"paused\": false",
            "\"paused\": false,\n  \"token\": \"flowie_live_leaked\"",
        );
        std::fs::write(CompanionConfig::path_in(directory.path()), tampered).unwrap();
        assert!(matches!(
            CompanionConfig::load(directory.path()),
            Err(ConfigError::Malformed { .. })
        ));
    }

    #[test]
    fn a_run_finds_its_repository_by_project() {
        let config = config();
        assert!(config.repository_for("cproj1").is_some());
        assert!(config.repository_for("cproj-unknown").is_none());
    }
}
