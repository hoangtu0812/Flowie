"""Bug-report sections shared by MCP guidance and human-authored issue templates."""

BUG_TEMPLATE = {
    "title": "Bug report",
    "requiredSections": [
        "Environment and affected version",
        "Steps to reproduce",
        "Expected result",
        "Actual result",
        "Acceptance criteria",
    ],
    "optionalSections": [
        "Severity and impact",
        "Logs and screenshots",
        "Regression information",
    ],
    "descriptionTemplate": """## Environment and affected version

## Steps to reproduce
1.

## Expected result

## Actual result

## Severity and impact

## Logs and screenshots

## Acceptance criteria
- [ ] The reproduction no longer fails.
- [ ] Regression tests pass.
""",
    "classification": "Choose an existing bug label from list_issue_options; do not invent a label ID.",
}
