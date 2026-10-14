import pytest
from pydantic import ValidationError

from app.modules.work_items.contracts import UpdateDocumentInput


@pytest.mark.parametrize('field', ['title', 'content', 'sourceType', 'pinned', 'position'])
def test_document_updates_reject_null_for_nonnullable_columns(field):
    with pytest.raises(ValidationError):
        UpdateDocumentInput(**{field: None})


def test_document_updates_keep_empty_content_and_nullable_links():
    assert UpdateDocumentInput(content='', folderId=None, sourceUrl=None).model_dump(exclude_unset=True) == {
        'content': '', 'folderId': None, 'sourceUrl': None,
    }
    assert UpdateDocumentInput().model_dump(exclude_unset=True) == {}
