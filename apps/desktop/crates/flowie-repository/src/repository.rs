//! The checkout and the per-run worktrees cut from it.
//!
//! A run never works in the user's checkout. It gets a worktree of its own,
//! placed beside the checkout rather than inside it, so the agent cannot
//! disturb whatever the person has open and so a stray worktree never turns
//! into a nested repository.
//! VI: Checkout và các worktree cắt ra từ nó cho từng run.
//! VI: Một run không bao giờ làm việc trong checkout của người dùng. Nó có
//! VI: worktree riêng, đặt cạnh checkout chứ không nằm trong checkout, để
//! VI: agent không đụng tới thứ người dùng đang mở và để một worktree sót lại
//! VI: không biến thành repository lồng nhau.

use std::path::{Path, PathBuf};

use crate::error::{Error, Result};
use crate::git;

/// What the server says a project's repository is.
/// VI: Những gì server nói về repository của một project.
#[derive(Debug, Clone)]
pub struct RepositoryConfig {
    pub repository_url: String,
    pub base_branch: String,
    pub path: PathBuf,
    pub worktree_root: Option<PathBuf>,
}

impl RepositoryConfig {
    /// Worktrees live beside the checkout, in a sibling directory named after
    /// it. Inside the checkout they would show up as untracked files in every
    /// status the agent runs.
    /// VI: Worktree nằm cạnh checkout, trong một thư mục anh em đặt tên theo
    /// VI: nó. Nếu nằm trong checkout, chúng sẽ hiện ra dưới dạng file chưa
    /// VI: theo dõi trong mọi lần agent chạy status.
    pub fn worktree_root(&self) -> PathBuf {
        if let Some(root) = &self.worktree_root {
            return root.clone();
        }
        let name = self
            .path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "repository".to_string());
        self.path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(format!("{name}.flowie-worktrees"))
    }

    /// The base branch without an `origin/` prefix, which the server may send
    /// either way.
    /// VI: Base branch không có tiền tố `origin/`, vì server có thể gửi theo
    /// VI: cả hai cách.
    pub fn base_branch_name(&self) -> &str {
        self.base_branch
            .strip_prefix("origin/")
            .unwrap_or(&self.base_branch)
    }
}

/// A checkout that has been verified against its configuration.
/// VI: Một checkout đã được đối chiếu với cấu hình của nó.
#[derive(Debug)]
pub struct Repository {
    config: RepositoryConfig,
}

impl Repository {
    /// Verifies the checkout before anything is written anywhere. Running an
    /// agent against the wrong repository, or against a base branch that does
    /// not exist, produces work that cannot be reviewed, so this runs first
    /// and refuses rather than repairs.
    /// VI: Đối chiếu checkout trước khi ghi bất cứ thứ gì ở bất cứ đâu. Chạy
    /// VI: agent lên nhầm repository, hoặc lên một base branch không tồn tại,
    /// VI: sinh ra thứ không review được, nên bước này chạy trước và từ chối
    /// VI: chứ không tự sửa.
    pub fn open(config: RepositoryConfig) -> Result<Self> {
        git::validate_branch(config.base_branch_name())?;

        if !config.path.is_dir() {
            return Err(Error::Checkout(format!(
                "{} is not a directory",
                config.path.display()
            )));
        }

        let inside = git::run(&config.path, ["rev-parse", "--is-inside-work-tree"])?;
        if !inside.ok() || inside.line() != "true" {
            return Err(Error::Checkout(format!(
                "{} is not a git checkout",
                config.path.display()
            )));
        }

        let origin = git::run(&config.path, ["remote", "get-url", "origin"])?;
        if !origin.ok() {
            return Err(Error::Checkout("the checkout has no origin remote".into()));
        }
        if !git::same_remote(origin.line(), &config.repository_url) {
            return Err(Error::Checkout(format!(
                "origin is {} but the project is configured for {}",
                origin.line(),
                config.repository_url
            )));
        }

        let base = config.base_branch_name();
        let exists = git::run(
            &config.path,
            [
                "rev-parse",
                "--verify",
                "--quiet",
                &format!("refs/remotes/origin/{base}"),
            ],
        )?;
        if !exists.ok() {
            return Err(Error::Checkout(format!(
                "origin/{base} does not exist in this checkout"
            )));
        }

        Ok(Self { config })
    }

    pub fn config(&self) -> &RepositoryConfig {
        &self.config
    }

    /// Cuts a worktree for one run, on its own branch taken from the remote
    /// base. The run id names both, so a leftover directory can always be
    /// traced back to the run that made it.
    /// VI: Cắt một worktree cho một run, trên nhánh riêng lấy từ base trên
    /// VI: remote. Run id đặt tên cho cả hai, nên một thư mục sót lại luôn
    /// VI: truy ngược được về run đã tạo ra nó.
    pub fn worktree(&self, run_id: &str) -> Result<Worktree> {
        if run_id.is_empty()
            || !run_id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            return Err(Error::Configuration(
                "a run id must be alphanumeric with dashes".into(),
            ));
        }
        let root = self.config.worktree_root();
        std::fs::create_dir_all(&root).map_err(|error| Error::Git {
            message: format!("could not create {}: {error}", root.display()),
        })?;

        let path = root.join(run_id);
        let branch = format!("flowie/run-{run_id}");
        let base = format!("origin/{}", self.config.base_branch_name());

        git::checked(
            &self.config.path,
            "creating the run worktree",
            [
                "worktree".as_ref(),
                "add".as_ref(),
                "-b".as_ref(),
                branch.as_ref(),
                path.as_os_str(),
                base.as_ref(),
            ] as [&std::ffi::OsStr; 6],
        )?;

        Ok(Worktree {
            path,
            branch,
            checkout: self.config.path.clone(),
        })
    }
}

/// One run's working copy.
/// VI: Bản làm việc của một run.
#[derive(Debug)]
pub struct Worktree {
    path: PathBuf,
    branch: String,
    checkout: PathBuf,
}

impl Worktree {
    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn branch(&self) -> &str {
        &self.branch
    }

    /// True when the worktree holds changes that are not committed.
    /// VI: Đúng khi worktree còn thay đổi chưa commit.
    pub fn has_uncommitted_changes(&self) -> Result<bool> {
        let status = git::checked(
            &self.path,
            "reading the worktree status",
            ["status", "--porcelain"],
        )?;
        Ok(!status.stdout.trim().is_empty())
    }

    /// Commits everything the agent produced. Returns `None` when the agent
    /// changed nothing, which is a legitimate outcome and not a failure.
    /// VI: Commit mọi thứ agent tạo ra. Trả về `None` khi agent không đổi gì,
    /// VI: đó là một kết cục hợp lệ chứ không phải thất bại.
    pub fn commit(&self, message: &str) -> Result<Option<String>> {
        git::checked(&self.path, "staging the run changes", ["add", "-A"])?;
        if !self.has_uncommitted_changes()? {
            return Ok(None);
        }
        git::checked(
            &self.path,
            "committing the run changes",
            ["commit", "--no-verify", "-m", message],
        )?;
        let head = git::checked(&self.path, "reading the new commit", ["rev-parse", "HEAD"])?;
        Ok(Some(head.line().to_string()))
    }

    /// Removes the worktree, but only when nothing would be lost.
    ///
    /// `keep_work` is what the caller already knows: a failed run keeps its
    /// worktree so the work can be inspected. Even on success the worktree is
    /// kept if it still holds uncommitted changes, because leaving a directory
    /// behind is a smaller harm than deleting someone's work.
    /// VI: Xoá worktree, nhưng chỉ khi không mất gì.
    /// VI: `keep_work` là điều bên gọi đã biết: một run thất bại giữ lại
    /// VI: worktree để xem lại được. Kể cả khi thành công, worktree vẫn được
    /// VI: giữ nếu còn thay đổi chưa commit, vì để thừa một thư mục là tác hại
    /// VI: nhỏ hơn xoá mất công việc của ai đó.
    pub fn retire(self, keep_work: bool) -> Result<Retired> {
        if keep_work {
            return Ok(Retired::Kept {
                path: self.path,
                reason: "the run did not finish cleanly".into(),
            });
        }
        if self.has_uncommitted_changes().unwrap_or(true) {
            return Ok(Retired::Kept {
                path: self.path,
                reason: "the worktree still holds uncommitted changes".into(),
            });
        }
        let removed = git::run(
            &self.checkout,
            [
                "worktree".as_ref(),
                "remove".as_ref(),
                self.path.as_os_str(),
            ] as [&std::ffi::OsStr; 3],
        )?;
        if !removed.ok() {
            return Ok(Retired::Kept {
                path: self.path,
                reason: format!("git could not remove it: {}", removed.stderr.trim()),
            });
        }
        Ok(Retired::Removed)
    }
}

/// What happened to a worktree, which the caller reports rather than guesses.
/// VI: Chuyện gì đã xảy ra với một worktree, bên gọi báo lại chứ không đoán.
#[derive(Debug, PartialEq, Eq)]
pub enum Retired {
    Removed,
    Kept { path: PathBuf, reason: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_worktree_root_sits_beside_the_checkout() {
        let config = RepositoryConfig {
            repository_url: "https://example.com/a/b".into(),
            base_branch: "main".into(),
            path: PathBuf::from("/home/me/code/flowie"),
            worktree_root: None,
        };
        assert_eq!(
            config.worktree_root(),
            PathBuf::from("/home/me/code/flowie.flowie-worktrees")
        );
    }

    #[test]
    fn the_base_branch_accepts_either_spelling() {
        let mut config = RepositoryConfig {
            repository_url: "https://example.com/a/b".into(),
            base_branch: "origin/main".into(),
            path: PathBuf::from("."),
            worktree_root: None,
        };
        assert_eq!(config.base_branch_name(), "main");
        config.base_branch = "main".into();
        assert_eq!(config.base_branch_name(), "main");
    }
}
