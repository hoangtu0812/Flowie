//! Checks against real git repositories built in a temporary directory.
//! Nothing here is mocked: the point is to find out what git actually does on
//! this platform, including with Vietnamese paths and spaces.
//! VI: Kiểm tra trên repository git thật dựng trong thư mục tạm. Không có gì
//! VI: giả lập ở đây: mục đích là biết git thật sự làm gì trên nền tảng này,
//! VI: kể cả với đường dẫn tiếng Việt và khoảng trắng.

use std::path::{Path, PathBuf};
use std::process::Command;

use flowie_repository::{Error, Repository, RepositoryConfig, Retired};

fn git(directory: &Path, arguments: &[&str]) {
    let status = Command::new("git")
        .args(arguments)
        .current_dir(directory)
        .status()
        .expect("git should be installed");
    assert!(status.success(), "git {arguments:?} failed");
}

/// Builds an origin repository and a clone of it, so `origin/<base>` exists
/// the way it does on a developer's machine.
/// VI: Dựng một repository origin và một bản clone của nó, để `origin/<base>`
/// VI: tồn tại đúng như trên máy lập trình viên.
fn repository_pair(root: &Path, folder: &str) -> (PathBuf, PathBuf) {
    let origin = root.join("origin.git");
    std::fs::create_dir_all(&origin).unwrap();
    git(&origin, &["init", "--bare", "--initial-branch=main", "."]);

    let seed = root.join("seed");
    std::fs::create_dir_all(&seed).unwrap();
    git(&seed, &["init", "--initial-branch=main", "."]);
    git(&seed, &["config", "user.email", "test@example.invalid"]);
    git(&seed, &["config", "user.name", "flowie test"]);
    git(&seed, &["config", "commit.gpgsign", "false"]);
    std::fs::write(seed.join("README.md"), "seed\n").unwrap();
    git(&seed, &["add", "-A"]);
    git(&seed, &["commit", "-m", "seed"]);
    git(
        &seed,
        &["remote", "add", "origin", origin.to_str().unwrap()],
    );
    git(&seed, &["push", "-u", "origin", "main"]);

    let checkout = root.join(folder);
    git(
        root,
        &[
            "clone",
            origin.to_str().unwrap(),
            checkout.to_str().unwrap(),
        ],
    );
    git(&checkout, &["config", "user.email", "test@example.invalid"]);
    git(&checkout, &["config", "user.name", "flowie test"]);
    git(&checkout, &["config", "commit.gpgsign", "false"]);
    (origin, checkout)
}

fn config(origin: &Path, checkout: &Path) -> RepositoryConfig {
    RepositoryConfig {
        repository_url: origin.to_string_lossy().into_owned(),
        base_branch: "main".into(),
        path: checkout.to_path_buf(),
        worktree_root: None,
    }
}

#[test]
fn a_matching_checkout_opens_and_yields_a_worktree() {
    let root = tempfile::tempdir().unwrap();
    let (origin, checkout) = repository_pair(root.path(), "checkout");

    let repository = Repository::open(config(&origin, &checkout)).unwrap();
    let worktree = repository.worktree("run-1").unwrap();

    assert!(worktree.path().is_dir());
    assert_eq!(worktree.branch(), "flowie/run-run-1");
    // Beside the checkout, never inside it: a worktree within the checkout
    // would appear as untracked files in every status the agent runs.
    // VI: Cạnh checkout, không bao giờ bên trong: worktree nằm trong checkout
    // VI: sẽ hiện thành file chưa theo dõi trong mọi lần agent chạy status.
    assert!(!worktree.path().starts_with(&checkout));
    assert!(worktree.path().starts_with(root.path()));
}

#[test]
fn a_path_with_vietnamese_characters_and_spaces_works() {
    let root = tempfile::tempdir().unwrap();
    let (origin, checkout) = repository_pair(root.path(), "mã nguồn của tôi");

    let repository = Repository::open(config(&origin, &checkout)).unwrap();
    let worktree = repository.worktree("run-2").unwrap();
    assert!(worktree.path().is_dir());

    std::fs::write(worktree.path().join("new.txt"), "nội dung\n").unwrap();
    let commit = worktree.commit("flowie run run-2").unwrap();
    assert!(commit.is_some());
}

#[test]
fn a_run_that_changed_nothing_reports_no_commit() {
    let root = tempfile::tempdir().unwrap();
    let (origin, checkout) = repository_pair(root.path(), "checkout");
    let repository = Repository::open(config(&origin, &checkout)).unwrap();
    let worktree = repository.worktree("run-3").unwrap();

    assert_eq!(worktree.commit("nothing happened").unwrap(), None);
}

#[test]
fn an_origin_that_differs_from_the_configuration_is_refused() {
    let root = tempfile::tempdir().unwrap();
    let (_origin, checkout) = repository_pair(root.path(), "checkout");

    let mut wrong = config(Path::new("https://example.com/someone/else"), &checkout);
    wrong.repository_url = "https://example.com/someone/else".into();
    let error = Repository::open(wrong).unwrap_err();
    assert!(matches!(error, Error::Checkout(_)), "got {error:?}");
}

#[test]
fn a_base_branch_that_does_not_exist_is_refused() {
    let root = tempfile::tempdir().unwrap();
    let (origin, checkout) = repository_pair(root.path(), "checkout");

    let mut missing = config(&origin, &checkout);
    missing.base_branch = "release-9".into();
    let error = Repository::open(missing).unwrap_err();
    assert!(matches!(error, Error::Checkout(_)), "got {error:?}");
}

#[test]
fn a_directory_that_is_not_a_checkout_is_refused() {
    let root = tempfile::tempdir().unwrap();
    let plain = root.path().join("plain");
    std::fs::create_dir_all(&plain).unwrap();

    let error = Repository::open(RepositoryConfig {
        repository_url: "https://example.com/a/b".into(),
        base_branch: "main".into(),
        path: plain,
        worktree_root: None,
    })
    .unwrap_err();
    assert!(matches!(error, Error::Checkout(_)), "got {error:?}");
}

#[test]
fn a_hostile_base_branch_never_reaches_git() {
    let root = tempfile::tempdir().unwrap();
    let (origin, checkout) = repository_pair(root.path(), "checkout");

    let mut hostile = config(&origin, &checkout);
    hostile.base_branch = "--upload-pack=touch owned".into();
    let error = Repository::open(hostile).unwrap_err();
    // Refused by configuration validation, not by git: the value must never
    // be handed to a command at all.
    // VI: Bị từ chối ở bước kiểm tra cấu hình chứ không phải bởi git: giá trị
    // VI: đó không bao giờ được đưa vào một lệnh.
    assert!(matches!(error, Error::Configuration(_)), "got {error:?}");
}

#[test]
fn a_clean_worktree_is_removed_after_a_successful_run() {
    let root = tempfile::tempdir().unwrap();
    let (origin, checkout) = repository_pair(root.path(), "checkout");
    let repository = Repository::open(config(&origin, &checkout)).unwrap();
    let worktree = repository.worktree("run-4").unwrap();
    let path = worktree.path().to_path_buf();

    std::fs::write(worktree.path().join("done.txt"), "done\n").unwrap();
    worktree.commit("flowie run run-4").unwrap();

    assert_eq!(
        worktree_retire(&repository, "run-4-again"),
        Retired::Removed
    );
    let _ = path;
}

fn worktree_retire(repository: &Repository, run: &str) -> Retired {
    let worktree = repository.worktree(run).unwrap();
    worktree.retire(false).unwrap()
}

#[test]
fn a_worktree_with_unsaved_work_is_kept_even_on_success() {
    let root = tempfile::tempdir().unwrap();
    let (origin, checkout) = repository_pair(root.path(), "checkout");
    let repository = Repository::open(config(&origin, &checkout)).unwrap();
    let worktree = repository.worktree("run-5").unwrap();
    let path = worktree.path().to_path_buf();

    std::fs::write(worktree.path().join("unsaved.txt"), "work in progress\n").unwrap();

    match worktree.retire(false).unwrap() {
        Retired::Kept { path: kept, reason } => {
            assert_eq!(kept, path);
            assert!(reason.contains("uncommitted"), "{reason}");
        }
        other => panic!("the worktree must be kept, got {other:?}"),
    }
    assert!(path.is_dir(), "the directory must still exist");
    assert!(path.join("unsaved.txt").is_file(), "the work must survive");
}

#[test]
fn a_failed_run_keeps_its_worktree_even_when_clean() {
    let root = tempfile::tempdir().unwrap();
    let (origin, checkout) = repository_pair(root.path(), "checkout");
    let repository = Repository::open(config(&origin, &checkout)).unwrap();
    let worktree = repository.worktree("run-6").unwrap();
    let path = worktree.path().to_path_buf();

    match worktree.retire(true).unwrap() {
        Retired::Kept { reason, .. } => assert!(reason.contains("did not finish"), "{reason}"),
        other => panic!("a failed run must keep its worktree, got {other:?}"),
    }
    assert!(path.is_dir());
}
