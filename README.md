# FabioBot - OpenClaw Power BI Agent

OpenClaw-based AI agent platform for automated Power BI report creation from semantic models.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  Oracle Cloud Free Tier                       │
│                  (ARM A1 - 4 OCPU, 24GB RAM)                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  Docker Compose                       │   │
│  │                                                       │   │
│  │  ┌─────────────────┐    ┌──────────────────────┐     │   │
│  │  │  OpenClaw        │    │  OpenClaw CLI         │     │   │
│  │  │  Gateway          │    │  (management)         │     │   │
│  │  │  :18789           │    │                       │     │   │
│  │  └────────┬──────────┘    └───────────────────────┘     │   │
│  │           │                                              │   │
│  │  ┌────────▼──────────────────────────────────────┐      │   │
│  │  │              Agent: PowerBI Developer           │      │   │
│  │  │                                                 │      │   │
│  │  │  Skills:                                        │      │   │
│  │  │  - powerbi-report-builder (custom)             │      │   │
│  │  │  - powerbi-workspace-manager (custom)          │      │   │
│  │  │  - fabric-api (custom)                         │      │   │
│  │  │                                                 │      │   │
│  │  │  Capabilities:                                  │      │   │
│  │  │  1. List semantic models in workspace           │      │   │
│  │  │  2. Analyze semantic model schema               │      │   │
│  │  │  3. Create PBIR report definitions              │      │   │
│  │  │  4. Deploy reports via Fabric REST API          │      │   │
│  │  │  5. Manage workspace permissions                │      │   │
│  │  └─────────────────────────────────────────────────┘      │   │
│  │                                                           │   │
│  │  ┌─────────────────────────────────────────────────┐      │   │
│  │  │         (Future) Agent: Fabric Engineer          │      │   │
│  │  │                                                  │      │   │
│  │  │  - Semantic model design & modification          │      │   │
│  │  │  - Warehouse / Lakehouse management             │      │   │
│  │  │  - F2 capacity workspace operations             │      │   │
│  │  └─────────────────────────────────────────────────┘      │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐    │
│  │  Nginx Proxy  │  │  Certbot     │  │  Watchtower    │    │
│  │  (SSL/TLS)    │  │  (Let's      │  │  (auto-update) │    │
│  │  :80 / :443   │  │   Encrypt)   │  │                │    │
│  └──────────────┘  └──────────────┘  └────────────────┘    │
└─────────────────────────────────────────────────────────────┘
          │
          │  Fabric REST API / Power BI REST API
          ▼
┌─────────────────────────────────────────┐
│         Microsoft Fabric / Power BI      │
│                                          │
│  Workspace A (Reports + Semantic Models) │
│  ├── Semantic Model 1                    │
│  ├── Semantic Model 2                    │
│  └── Reports (created by bot)            │
│                                          │
│  Workspace B (Future - F2 capacity)      │
│  ├── Warehouse                           │
│  └── Lakehouse                           │
└─────────────────────────────────────────┘
```

## Components

### 1. OpenClaw Gateway
- Main runtime, handles messaging channels (Teams, Slack, Telegram, etc.)
- Manages agent sessions, memory, and skill execution
- Web UI dashboard on port 18789

### 2. PowerBI Developer Agent
Custom OpenClaw agent with skills for:
- **powerbi-report-builder**: Creates Power BI reports (PBIR format) from semantic models
- **powerbi-workspace-manager**: Lists and manages workspace content
- **fabric-api**: Wrapper around Microsoft Fabric REST API

### 3. Infrastructure
- **Nginx reverse proxy** with SSL via Let's Encrypt
- **Watchtower** for automatic container updates
- Oracle Cloud Always Free ARM instance

## Prerequisites

- Oracle Cloud account (Always Free tier)
- Azure AD App Registration (Service Principal) for Power BI API access
- API key for LLM provider (Claude / OpenAI / etc.)
- Domain name (optional, for SSL)

## Quick Start

```bash
# 1. Clone this repo on your Oracle Cloud instance
git clone https://github.com/VolPark/FabioBot.git
cd FabioBot

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your API keys and Azure credentials

# 3. Deploy
./deploy.sh
```

## Azure AD Setup for Power BI

1. Register an app in Azure AD
2. Add API permissions: `Power BI Service` > `Dataset.ReadWrite.All`, `Report.ReadWrite.All`, `Workspace.ReadWrite.All`
3. Create a client secret
4. Add the Service Principal to your Power BI workspace as Admin/Member
5. Enable "Service principals can use Fabric APIs" in Power BI Admin Portal

## Cost

| Component | Monthly Cost |
|-----------|-------------|
| Oracle Cloud (ARM A1, 4 OCPU, 24GB) | $0 (Always Free) |
| LLM API (Claude Haiku/Sonnet) | ~$3-20 (usage-based) |
| Domain name (optional) | ~$1/month |
| **Total** | **$0-21/month** |

## Roadmap

- [x] Architecture design
- [ ] OpenClaw Docker deployment on Oracle Cloud
- [ ] Power BI Report Builder skill
- [ ] Power BI Workspace Manager skill
- [ ] Fabric REST API integration
- [ ] Teams/Slack channel integration
- [ ] Fabric Engineer agent (semantic models, warehouse, lakehouse)
