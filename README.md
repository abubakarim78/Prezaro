# 🎓 Prezaro — AI-Powered Facial Recognition Attendance & Class Management System

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)](https://react.dev/)
[![Bun](https://img.shields.io/badge/Bun-1.3+-fbf0df?style=flat-square&logo=bun)](https://bun.sh/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=flat-square&logo=pwa)](https://web.dev/progressive-web-apps/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)

**Prezaro** is a state-of-the-art, offline-capable Progressive Web Application (PWA) designed for modern universities and educational institutions. Built for speed and reliability, it enables lecturers to take fast, contactless attendance in seconds using client-side facial recognition, manage academic schedules, receive automated notifications for upcoming lectures, handle latecomers seamlessly, and sync attendance logs even in low-connectivity lecture halls.

---

## 📑 Table of Contents

- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Installation](#local-installation)
  - [Database Setup](#database-setup)
- [Environment Variables](#-environment-variables)
- [Application Workflows](#-application-workflows)
  - [1. Face Recognition Attendance](#1-face-recognition-attendance)
  - [2. Latecomer Handling In-Progress](#2-latecomer-handling-in-progress)
  - [3. Class Timetable & Rescheduling](#3-class-timetable--rescheduling)
  - [4. Automated Class Reminders & Notifications](#4-automated-class-reminders--notifications)
  - [5. Offline-First Sync Architecture](#5-offline-first-sync-architecture)
- [Production Deployment](#-production-deployment)
  - [Deploying with Coolify](#deploying-with-coolify)
  - [Deploying with Docker Compose](#deploying-with-docker-compose)
  - [HTTPS & Camera Permissions](#https--camera-permissions)
- [Project Structure](#-project-structure)
- [Troubleshooting & FAQs](#-troubleshooting--faqs)
- [Contributing & License](#-license)

---

## ⚡ Key Features

### 📸 Real-Time AI Facial Recognition
- **Dual Scanning Modes**:
  - **Walkthrough Mode**: The lecturer walks through the hall; the camera continuously detects and verifies multiple students simultaneously in real time.
  - **Kiosk Mode**: Mount a tablet or phone at the classroom entrance; students step up for single-capture frontal check-in.
- **Client-Side Privacy**: Face landmarks and 128-dimensional biometric embeddings are calculated entirely on the client device using WebGL-accelerated TensorFlow.js models. Raw video streams and student photos are never transmitted to external APIs.
- **Hardware-Accelerated Low-Light Enhancement**: Real-time GPU filter pipeline (`ectx.filter`) dynamically boosts contrast and luminance in dimly lit lecture theatres with zero CPU lag.
- **Anti-Impostor Ambiguity Margin**: Mathematical margin verification ensures that faces sharing ambiguous similarity scores are never misattributed.

### ⏰ Class Scheduling & Smart Timetables
- **Weekly Schedule Planner**: Clean, intuitive timetable manager featuring 30-minute interval selectors, 1-tap lecture duration presets (1h, 1.5h, 2h, 3h), and venue quick-toggle chips.
- **Instant Class Rescheduling**: Lecturers can reschedule or change lecture venues on the fly, automatically updating the timetable and alerts.
- **Countdown Hero Card**: Home dashboard displays active or upcoming classes with remaining time badges, venue details, and instant 1-tap attendance launch.

### 🔔 Automated Reminders & Push Notifications
- **Web Push Notifications**: Delivers push alerts directly to lecturers' mobile devices and desktop browsers prior to scheduled lectures (even when the browser tab is in background).
- **Email Notifications**: Seamless delivery of class alerts and summary reports via **Resend** or standard SMTP (with built-in simulated outbox logging for offline testing).
- **Configurable Lead Times**: Receive reminders 15, 30, or 60 minutes before class begins.

### 🏃 In-Progress Session Management & Late Arrivals
- **Add Latecomers Without Resetting**: If a student arrives late, lecturers can mark them late via camera or manual student search directly from the active session review screen without creating a new session.
- **Manual Check-In Dialog**: Search students by name or ID index; top-anchored modal design ensures full usability above mobile virtual keyboards.

### 📶 Offline-First & Progressive Web App (PWA)
- **Installable on iOS & Android**: Add to Home Screen with full native-like fullscreen experience.
- **Zero-Drop Attendance Queue**: Attendance logs taken offline are stored immediately in client-side IndexedDB and automatically flush to the PostgreSQL server when internet connectivity resumes.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Client ["Client Device (PWA / Mobile / Desktop)"]
        UI["Prezaro Web App (Next.js 16 + React 19)"]
        Engine["face-api.js + TensorFlow.js (WebGL)"]
        IndexedDB["IndexedDB (Offline Queue)"]
        ServiceWorker["Service Worker (PWA Caching & Push)"]
    end

    subgraph Server ["Prezaro Backend / Node / Bun Server"]
        NextAPI["Next.js Route Handlers (/api/*)"]
        AuthService["Bcrypt & Session Auth"]
        PrismaORM["Prisma Client ORM"]
        EmailService["Email Engine (Resend API / SMTP)"]
        Scheduler["Class Reminder Cron Worker"]
    end

    subgraph Storage ["Database & External Services"]
        Postgres[(PostgreSQL 16)]
        ResendAPI["Resend Email API"]
    end

    UI --> Engine
    UI --> IndexedDB
    UI --> ServiceWorker
    UI --> NextAPI
    NextAPI --> AuthService
    NextAPI --> PrismaORM
    NextAPI --> EmailService
    Scheduler --> PrismaORM
    Scheduler --> EmailService
    Scheduler --> ServiceWorker
    PrismaORM --> Postgres
    EmailService --> ResendAPI
```

---

## 🛠️ Tech Stack

| Layer | Technology | Description |
|---|---|---|
| **Runtime** | [Bun](https://bun.sh/) | Blazing fast JavaScript/TypeScript runtime and package manager |
| **Framework** | [Next.js 16](https://nextjs.org/) | App Router, Server Actions, Route Handlers, Standalone output |
| **Frontend** | [React 19](https://react.dev/) | Modern UI primitives with concurrency support |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) | Next-generation utility-first styling |
| **Components** | [Radix UI](https://www.radix-ui.com/) + [Lucide](https://lucide.dev/) | Accessible UI primitives and modern iconography |
| **Animations** | [Framer Motion](https://www.framer.com/motion/) | Fluid micro-interactions and screen transitions |
| **AI / Biometrics** | [face-api.js](https://github.com/justadudewhohacks/face-api.js) | Client-side face detection, 68-point landmarks, 128-d embeddings |
| **Database** | [PostgreSQL 16](https://www.postgresql.org/) | Robust relational database |
| **ORM** | [Prisma 6](https://www.prisma.io/) | Type-safe database client and automated migrations |
| **Email** | [Resend](https://resend.com/) / [Nodemailer](https://nodemailer.com/) | Transactional email delivery with fallback outbox logging |
| **Notifications** | Web Push API | Background mobile and desktop notifications |
| **Containers** | Docker & Docker Compose | Containerized builds optimized for production and Coolify |

---

## 🚀 Getting Started

### Prerequisites
- [Bun](https://bun.sh/) (v1.1.0 or newer recommended)
- [PostgreSQL](https://www.postgresql.org/) (v14+) running locally or via Docker
- A modern web browser supporting WebGL and MediaDevices (Chrome, Edge, Safari, Firefox)

### Local Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/abubakarim78/Prezaro.git
   cd Prezaro
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` and set your `DATABASE_URL` and `AUTH_SECRET`.*

### Database Setup

1. **Push schema to your PostgreSQL database**:
   ```bash
   bun run db:push
   ```

2. **Generate the Prisma client**:
   ```bash
   bun run db:generate
   ```

3. **Start the development server**:
   ```bash
   bun run dev
   ```

4. **Open the application**:
   Navigate to [http://localhost:3000](http://localhost:3000) in your browser.
   On first launch, the admin account specified in your `.env` (`BOOTSTRAP_EMAIL`) will be created automatically.

---

## 🔑 Environment Variables

Configure these variables in your `.env` file or within your hosting dashboard (e.g., Coolify):

| Variable | Required | Default | Description |
|---|:---:|:---:|---|
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string (`postgresql://user:pass@host:5432/prezaro?schema=public`) |
| `AUTH_SECRET` | **Yes** | — | Strong 64-character secret for sessions (`openssl rand -base64 32`) |
| `NODE_ENV` | Optional | `development` | Runtime mode (`development` or `production`) |
| `PORT` | Optional | `3000` | Port the HTTP server binds to |
| `DOMAIN` | Optional | `localhost` | Production domain used for public URLs and Caddy proxying |
| `BOOTSTRAP_EMAIL` | Optional | `admin@uds.edu.gh` | Initial administrator login email |
| `BOOTSTRAP_PASSWORD` | Optional | `Admin123!` | Initial administrator login password |
| `BOOTSTRAP_NAME` | Optional | `Prezaro Administrator` | Initial administrator display name |
| `BOOTSTRAP_DEPARTMENT` | Optional | `General Administration` | Default department created during initialization |
| `RESEND_API_KEY` | Optional | — | API key from [Resend](https://resend.com) for sending notification emails |
| `RESEND_FROM` | Optional | — | Verified sender email (e.g. `Prezaro <attendance@yourdomain.com>`) |
| `SMTP_HOST` | Optional | — | Fallback SMTP host if not using Resend |
| `SMTP_PORT` | Optional | `587` | SMTP port |
| `SMTP_USER` | Optional | — | SMTP username |
| `SMTP_PASS` | Optional | — | SMTP password |
| `SMTP_FROM` | Optional | — | SMTP sender address |

> [!NOTE]
> If neither `RESEND_API_KEY` nor `SMTP_HOST` is configured, outgoing emails are safely logged in the in-app **Email Outbox** (`Settings → Email Notifications`), allowing full offline testing without bouncing.

---

## 📱 Application Workflows

### 1. Face Recognition Attendance
1. **Enrollment**: Navigate to **Courses → [Select Course] → Enrollments**. Upload reference face photos for students. The system generates 128-point face descriptors and securely stores them.
2. **Launch Session**: From the Home screen or Schedule, tap **Take Attendance** for your course.
3. **Select Mode**:
   - **Walkthrough**: Ideal for lecture halls. Hold the camera up and pan across students. Checked-in students glow green with an instant audio/haptic chirp.
   - **Kiosk**: Mount device on a stand. Students look directly into the camera to check in one at a time.
4. **End & Review**: Tap **End & Review** to verify present, late, and absent counts before closing the session.

### 2. Latecomer Handling In-Progress
- Once a class is in session, students arriving late can be added directly:
  - From the session summary/review view, tap **Add Late Students**.
  - Choose between **Camera Scan (Late Mode)** (which marks detected students with the `LATE` status badge) or **Manual Search** by name/ID.
  - The record is appended to the current session without disturbing existing attendance records.

### 3. Class Timetable & Rescheduling
- Manage weekly lectures under the **Schedule** tab:
  - Add recurring weekly classes with designated venues.
  - Quick-toggle between standardized 30-minute blocks (`08:00`, `08:30`, etc.) or use 1-tap duration buttons (+1h, +1.5h, +2h).
  - Need to move a class? Tap **Reschedule** on the class card or home screen, choose the new day, time, or venue, and save.

### 4. Automated Class Reminders & Notifications
- Enable notifications from the **Schedule** or **Settings** tab.
- Set reminder intervals (15, 30, or 60 minutes before class).
- The system automatically sends:
  - **Browser Push Notification** to registered phones/tablets.
  - **Email Alert** with course code, room/venue, and scheduled time.

### 5. Offline-First Sync Architecture
- If internet connectivity drops in a basement or remote lecture hall:
  - The scanning engine continues functioning using local neural net weights.
  - Scanned records are immediately committed to browser **IndexedDB**.
  - An orange "Offline — Saving on device" status appears.
  - Once connection is restored, records automatically flush to the PostgreSQL server.

---

## 🚢 Production Deployment

### Deploying with Coolify

Prezaro includes a production-ready `Dockerfile` and `docker-compose.yml` optimized for 1-click deployment on [Coolify](https://coolify.io):

1. In your Coolify dashboard, select **Create New Application** → **From Git Repository**.
2. Select repository: `abubakarim78/Prezaro`, branch: `main`.
3. Choose **Docker Compose** or **Dockerfile** (`deploy/Dockerfile`).
4. Add a **PostgreSQL Database** service in Coolify and link the `DATABASE_URL` environment variable.
5. In **Environment Variables**, configure:
   ```env
   DATABASE_URL=postgresql://prezaro:your_password@postgres:5432/prezaro?schema=public
   AUTH_SECRET=your_generated_64_character_secret
   BOOTSTRAP_EMAIL=your_email@university.edu
   BOOTSTRAP_PASSWORD=YourSecurePassword123!
   RESEND_API_KEY=re_123456789...
   RESEND_FROM=Prezaro <attendance@yourdomain.com>
   ```
6. Click **Deploy**. Coolify will build the standalone Next.js container, apply database schemas automatically via `deploy/entrypoint.sh`, and launch the app.

#### Enabling Automatic Redeployment on Git Push
To automatically redeploy on every commit:
1. In Coolify, go to your Prezaro application → **Webhooks**.
2. Copy the **Deploy Webhook URL**.
3. In GitHub, go to **Repository Settings → Webhooks → Add Webhook**.
4. Paste the URL, set content type to `application/json`, select **Just the push event**, and click **Add webhook**.

### Deploying with Docker Compose

To deploy manually on any Linux VPS:

```bash
# Clone the repository
git clone https://github.com/abubakarim78/Prezaro.git
cd Prezaro

# Copy and edit production environment
cp .env.example .env
nano .env

# Build and start services in background
docker compose up -d --build
```

### HTTPS & Camera Permissions

> [!IMPORTANT]
> Modern web browsers (especially iOS Safari and Android Chrome) strictly require an **HTTPS** connection to grant access to device cameras via `navigator.mediaDevices.getUserMedia()`.
> Ensure your deployment has a valid SSL certificate (configured automatically via Coolify's Traefik or the included Caddy service).

---

## 📂 Project Structure

```
Prezaro/
├── deploy/                  # Production deployment assets
│   ├── Dockerfile           # Multi-stage Bun build with standalone Next.js
│   ├── entrypoint.sh        # Startup script (db connection wait + prisma push + start)
│   └── Caddyfile            # Production reverse proxy with automated SSL
├── prisma/
│   └── schema.prisma        # Database schema (PostgreSQL)
├── public/
│   ├── models/              # Pretrained face-api.js neural network weight files
│   ├── icons/               # PWA app icons and splash assets
│   ├── manifest.json        # Progressive Web App manifest
│   └── sw.js                # Service Worker for offline caching and push notifications
├── src/
│   ├── app/                 # Next.js App Router (pages and API routes)
│   │   ├── api/             # REST API endpoints (sessions, courses, schedules, sync)
│   │   ├── layout.tsx       # Global layout with viewport safe-area handling
│   │   └── page.tsx         # Main entrypoint
│   ├── components/
│   │   ├── app/
│   │   │   ├── views/       # Application views (home, scan, schedule, courses, etc.)
│   │   │   │   ├── scan.tsx      # Main camera scanning view (hero screen)
│   │   │   │   ├── schedule.tsx  # Timetable and rescheduling manager
│   │   │   │   ├── session.tsx   # Active attendance session review & latecomers
│   │   │   │   └── home.tsx      # Dashboard with upcoming class card
│   │   │   └── shared.tsx   # Shared UI components and identity avatars
│   │   └── ui/              # Radix UI primitives and styled components
│   ├── lib/
│   │   ├── face/            # Face recognition engine & math
│   │   │   ├── engine.ts    # Camera initialization, GPU low-light filter, face detection
│   │   │   └── match.ts     # 128-d descriptor Euclidean distance matching
│   │   ├── offline.ts       # IndexedDB storage and offline sync queue
│   │   ├── email.ts         # Resend & SMTP notification transport
│   │   ├── scheduler.ts     # Lecture reminder scheduling & cron trigger
│   │   └── types.ts         # TypeScript data models
│   └── store.ts             # Global client state management (Zustand)
├── docker-compose.yml       # Production Docker Compose specification
├── package.json             # Scripts and dependencies
└── README.md                # Project documentation
```

---

## ❓ Troubleshooting & FAQs

### Why does the camera open but not detect any faces?
1. **No Student Photos Enrolled**: Make sure student photos have been added under **Courses → [Select Course] → Enrollments**. If a course has 0 enrolled face descriptors, the camera viewfinder will display a yellow notification banner guiding you to enroll students or use manual check-in.
2. **Lighting Conditions**: While Prezaro includes an automated low-light GPU compensation filter, faces in pitch-black environments or facing direct backlight may have difficulty matching.
3. **Camera Angle**: In Kiosk Mode, students should look directly into the camera from 0.5m – 1.5m away.

### Why is camera permission denied on my mobile phone?
Browsers block camera access on non-secure origins. Ensure you are accessing the app over **`https://`** (or `http://localhost` during local development).

### Can I run Prezaro without Docker?
Yes! You can run Prezaro natively on any machine with Bun and PostgreSQL installed:
```bash
bun install
bun run db:push
bun run dev
```

### How do I reset or change the Administrator password?
Update `BOOTSTRAP_PASSWORD` in `.env` and restart the container, or use Prisma Studio to inspect and manage user credentials:
```bash
bunx prisma studio
```

---

## 📄 License

This project is developed for educational and institutional attendance automation. Built with ❤️ by the Prezaro Team.
