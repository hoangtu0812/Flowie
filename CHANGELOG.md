# Changelog

All notable changes to Flowie are documented here.

## Unreleased

### Added

- Durable Inbox events for issue creation, assignment, status changes,
  comments, project property changes and project updates.
- Authenticated WebSocket delivery for real-time Inbox updates and sidebar
  unread counts.
- Discord webhook delivery for supported workspace events and optional
  Flowie bot channel broadcasting.
- Flowie-branded Help links to the product, project repository and changelog.

### Changed

- Discord integration configuration is now served by the Python/FastAPI API.

### Fixed

- The legacy API container now receives the shared `AUTH_JWT_SECRET`, so the
  paths the Python API still proxies (such as the project issue list) accept the
  session cookie instead of answering 401.
- Project detail pages name the request that failed instead of reporting a
  single generic "Could not load project details." message.

## 2026-08-25

### Added

- Native Python APIs for workspaces, teams, documents, cycles, projects,
  initiatives, issues and profile management.
- Docker deployment and GitHub Actions deployment workflow for the self-hosted
  production environment.
