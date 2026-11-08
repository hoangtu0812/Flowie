import logging
import logging.config
from dataclasses import replace

from uvicorn.config import LOGGING_CONFIG

from app.core.config import Settings
from app.main import create_app


def _as_uvicorn_would():
    """Reproduce the logging state the API actually starts in.

    Uvicorn applies this configuration and it names only the `uvicorn.*`
    loggers, so the root logger keeps its default WARNING level and no handler.
    Anything under `app.` then falls back to logging's last-resort handler,
    which is itself WARNING, and every `logger.info` is discarded.

    VI: Tái hiện đúng trạng thái logging mà API thật sự khởi động cùng. Uvicorn
    áp cấu hình này và nó chỉ nêu tên các logger `uvicorn.*`, nên root giữ mức
    WARNING mặc định và không có handler nào. Mọi thứ dưới `app.` rơi về handler
    cuối cùng của logging, bản thân nó cũng ở mức WARNING, và mọi `logger.info`
    bị bỏ đi.
    """
    root = logging.getLogger()
    for handler in list(root.handlers):
        root.removeHandler(handler)
    logging.config.dictConfig(LOGGING_CONFIG)
    root.setLevel(logging.WARNING)


def test_uvicorn_alone_would_discard_every_job_log():
    # Pins the reason the fix is needed. If a future uvicorn enables INFO on the
    # root logger this fails, and the fix below can then be reconsidered rather
    # than kept out of habit.
    # VI: Ghim lại lý do cần bản sửa. Nếu một bản uvicorn sau này bật INFO trên
    # VI: root logger thì test này hỏng, và khi đó bản sửa bên dưới được xem lại
    # VI: chứ không giữ theo thói quen.
    _as_uvicorn_would()
    assert not logging.getLogger("app.jobs.team_policies").isEnabledFor(logging.INFO)


def test_create_app_makes_job_logs_visible():
    """A job that reports what it would do must be able to say so.

    The team policy scan runs in reporting-only mode before it is trusted to
    write, and its entire output is one log line per cycle. With the root
    logger left as uvicorn leaves it that line never appears, so the scan looks
    identical whether it found nothing or never ran at all.

    VI: Một job báo cáo việc nó định làm thì phải nói ra được. Lượt quét chính
    sách team chạy ở chế độ chỉ báo cáo trước khi được tin để ghi, và toàn bộ
    đầu ra của nó là một dòng log mỗi chu kỳ. Nếu để root logger y như uvicorn
    để lại thì dòng đó không bao giờ xuất hiện, và lượt quét trông giống hệt
    nhau dù nó không tìm thấy gì hay chưa từng chạy.
    """
    _as_uvicorn_would()
    create_app(replace(Settings.from_environment(), log_level="INFO"))
    for name in (
        "app.jobs.team_policies",
        "app.jobs.reminders",
        "app.jobs.digest",
        "app.modules.news.worker",
    ):
        assert logging.getLogger(name).isEnabledFor(logging.INFO), name
    assert logging.getLogger().handlers, "no handler on the root logger"


def test_log_level_is_configurable_and_respected():
    # An operator who wants less noise can have it, and the setting is read
    # rather than assumed.
    # VI: Người vận hành muốn ít ồn hơn thì có quyền, và thiết lập này được đọc
    # VI: chứ không phải mặc định ngầm.
    _as_uvicorn_would()
    create_app(replace(Settings.from_environment(), log_level="WARNING"))
    logger = logging.getLogger("app.jobs.team_policies")
    assert not logger.isEnabledFor(logging.INFO)
    assert logger.isEnabledFor(logging.WARNING)
