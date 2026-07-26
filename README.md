<div align="center">
  <img src="frontend/public/logo.svg" alt="Flowie Logo" width="160" height="160" />
  <h1>Flowie</h1>
  <p><b>Enterprise-Grade Project Management & Team Collaboration Platform</b></p>

  <p>
    <a href="README.vi.md"><b>🇻🇳 Tiếng Việt</b></a> • 
    <a href="README.md"><b>🇬🇧 English</b></a>
  </p>

  <p>
    <a href="https://golang.org"><img src="https://img.shields.io/badge/Go-1.26-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go Version" /></a>
    <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16.2-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js" /></a>
    <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
    <a href="https://www.postgresql.org"><img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" /></a>
    <a href="https://www.docker.com"><img src="https://img.shields.io/badge/Docker-Supported-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge" alt="License" /></a>
  </p>

  <br />
</div>

---

## 📌 Overview

**Flowie** is a high-performance, enterprise-grade project management and team collaboration platform designed for modern software teams and enterprises. Built with a robust **Go** REST API backend and a responsive **Next.js 16** frontend, Flowie streamlines task tracking, workflow automation, resource management, and enterprise Single Sign-On (Azure AD) alongside Microsoft SharePoint document integration.

---

## ✨ Key Features

- 🗂️ **Multi-View Task Management:**
  - **Interactive Kanban Board:** Drag-and-drop workflow columns with configurable Work-In-Progress (WIP) limits.
  - **Timeline (Gantt Chart):** Critical Path Method (CPM) calculation, milestone tracking, and dependency visualization.
  - **Agile Sprints:** 1–2 week Sprint planning, backlog management, and team velocity metrics.
  - **Calendar & Workload Balancer:** Visual calendar projections and team capacity workload tracking.

- ⚡ **Automated Workflow Engine:**
  - Configurable **Trigger → Action** automation rules for auto-assignment, status transitions, and team notifications.

- 🔐 **Enterprise Security & Single Sign-On (SSO):**
  - One-click **Azure AD / Microsoft Entra ID** SSO (OIDC & OAuth2).
  - Fine-grained Role-Based Access Control (RBAC), 2FA, and remote session revocation capabilities.

- 📁 **SharePoint & Microsoft Graph File Storage:**
  - Automatic workspace/project document library folder creation and file syncing via Microsoft Graph API.

- 📈 **Agile Analytics & Reporting:**
  - Burndown charts, velocity graphs, and automated daily/weekly email digests to Slack and MS Teams.

- 💬 **Workspace Chat & Real-Time Collaboration:**
  - Channel-based team messaging, inline task comments, and instant event notifications.

---

## 🛠️ Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Backend** | **Go 1.26** (`net/http`, `chi` router) | High-concurrency RESTful API Server |
| **Database** | **PostgreSQL 16** (`sqlc` + `pgx`) | Relational database with type-safe query generation |
| **Frontend** | **Next.js 16** (React 19, TypeScript, TailwindCSS) | Fast, responsive Single Page Application UI |
| **Authentication** | **Azure AD / Entra ID** (OIDC / OAuth2) | Enterprise SSO & JWT Session Management |
| **File Storage** | **SharePoint / Microsoft Graph API** | Automated document library synchronization |
| **DevOps & Containers** | **Docker Compose** | Containerized local development & deployment |

---

## 📁 Directory Structure

```text
Flowie/
├── logo.svg                   # Vector SVG logo
├── docker-compose.yml         # Container configuration for PostgreSQL
├── .env.example               # Environment configuration template
├── README.md                  # Main English documentation
├── README.vi.md               # Vietnamese documentation (Bản tiếng Việt)
│
├── backend/                   # Go API Server
│   ├── cmd/api/               # HTTP server entrypoint
│   ├── internal/
│   │   ├── auth/              # Azure AD SSO, Session & 2FA Manager
│   │   ├── config/            # Environment variable configuration loader
│   │   ├── db/                # PostgreSQL Driver & Database Migrations
│   │   ├── handlers/          # API Handlers (Task, Sprint, Workflow, Webhooks)
│   │   ├── server/            # Middleware & HTTP Router
│   │   ├── storage/sharepoint/# Microsoft Graph API & SharePoint driver
│   │   └── store/             # SQLC Queries & Data Access Layer
│   └── run.ps1                # PowerShell runner script for Windows
│
├── frontend/                  # Next.js Frontend Application
│   ├── public/                # Static assets (logo.svg, favicon)
│   └── src/
│       ├── app/               # Next.js App Router pages & layouts
│       ├── components/        # Reusable UI components (Sidebar, TopBar...)
│       └── lib/               # API Client & Custom React Hooks
│
└── docs/                      # Architecture docs, roadmap & setup guides
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Go** (version >= 1.22)
- **Node.js** (version >= 18)
- **Docker & Docker Desktop** (for running PostgreSQL)

### 2. Environment Configuration

Copy the sample environment file and configure your local settings:

```bash
cp .env.example .env
```

*(Note: Open `.env` to configure your PostgreSQL credentials, `SESSION_SECRET`, and optional Azure AD settings).*

### 3. Local Development Setup

#### **Start PostgreSQL Container:**
```bash
docker compose up -d db
```

#### **Run Backend Server (Go API):**
```bash
cd backend
# On Linux/macOS:
make migrate && make run

# On Windows (PowerShell):
.\run.ps1
```
> The API Server will start listening at: `http://localhost:8080`

#### **Run Frontend App (Next.js):**
```bash
cd frontend
npm install
npm run dev
```
> The Frontend Web App will start listening at: `http://localhost:3000`

---

## 📚 Documentation & Resources

- 📖 [`docs/ROADMAP.md`](./docs/ROADMAP.md) — Detailed phase-by-phase implementation roadmap.
- 🔑 [`docs/azure-sharepoint-setup.md`](./docs/azure-sharepoint-setup.md) — Azure AD SSO & SharePoint setup guide.
- ⚙️ [`backend/README.md`](./backend/README.md) — Backend architecture & API endpoints documentation.
- 🎨 [`frontend/README.md`](./frontend/README.md) — Frontend Next.js app developer guide.

---

## 📄 License

Distributed under the **[MIT License](LICENSE)**.
