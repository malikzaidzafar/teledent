# Teledent AI — Frontend Web Application

Welcome to the frontend repository for **Teledent AI: Smart Dental Scanner and Live Diagnosis Platform for Remote Patient Care**. This is a custom-built, cloud-based web application designed to bridge the gap between patients and dental professionals through automated AI screening and secure video consultations.

The user interface and design systems for this platform are built and synced natively via **Google Stitch**.

---

## 🚀 Technical Stack

* 
**Framework:** Next.js (React) utilizing the App Router architecture.


* 
**Styling:** Tailwind CSS, driven by design tokens synced via the Stitch MCP server.


* 
**Authentication & Roles:** Firebase Auth & Role-Based Access Control (RBAC).


* 
**Real-time Communication:** Twilio / WebRTC for secure patient-dentist video consultations.



---

## 🛑 Strict Development Guardrails

To maintain a clean, maintainable, and high-performance codebase, all developers contributing to this frontend repository must strictly adhere to the following architectural rules:

### 1. 100% Server-Side Data Fetching

* **No Client-Side Fetching:** The use of client-side data fetching (`useEffect` fetches, `useSWR`, `React Query`, or client-side `axios` instances for initial data loading) is **strictly prohibited**.
* 
**Server Components First:** All data gathering from the backend API gateway must take place inside Next.js Server Components.


* 
**Mutations:** Client components may only execute network requests for user-driven mutations (e.g., submitting a scan, booking an appointment) via Next.js Server Actions or highly optimized form submission handlers.



### 2. Maximum Component File Length: 150 Lines

* **Hard Limit:** No single component file may exceed **150 lines of code** (including imports and styles).
* **Enforcement:** If a component starts growing past 150 lines, it must be systematically broken down into smaller, isolated sub-components or extracted into utility functions. Keep presentational elements decoupled from layout compositions.

### 3. Absolute Adherence to the DRY Principle

* **Don't Repeat Yourself:** Duplicate UI structures, repetitive Tailwind class strings, or duplicated logic pipelines will not pass code review.
* 
**Shared Design Tokens:** Global visual rules (typography styles, custom color spaces, border-radius configurations) must be universally extracted from the Google Stitch workspace and referenced centrally.


* 
**Component Reuse:** Build layout abstractions (`Button`, `Card`, `Modal`, `Table`) as reusable components inside the global UI kit folder.



---

## 📁 Repository Structure

```text
├── app/                     # Next.js App Router (All routes use Server Components for data fetching)
│   ├── (auth)/              # Authentication routing group (Firebase integration)
│   ├── admin/               # Administrative panel dashboards
│   ├── dentist/             # Dentist specific portals and case review streams
│   ├── patient/             # Patient dashboard, scan uploading, and booking modules
│   ├── layout.tsx           # Main root application layout
│   └── page.tsx             # System landing page
├── components/              # Strictly modular React UI items (Strictly < 150 lines per file)
│   ├── common/              # Shared structural elements (Navbars, Footers, Sidebar wrappers)
│   ├── ui/                  # Atomized design elements (Buttons, Inputs, Badges) synced with Stitch
│   └── views/               # Specific page sectional slices
├── hooks/                   # Lightweight custom hooks for local client states (e.g., media streaming controls)
├── lib/                     # Central SDK initialization files (Firebase client initialization, Twilio configs)
├── public/                  # Static application assets
├── styles/                  # Global Tailwind styling overrides and Stitch design system mappings
├── mcp.json                 # Stitch MCP server registration mapping for AI assistance matching
├── package.json             # Build scripts and dependency versions
└── README.md                # Repository documentation

```

---

## 🛠️ Getting Started & Local Environment

### Prerequisites

Ensure you have Node.js (v18.x or later) installed on your operating system.

### Installation

Clone the repository and install the development dependencies:

```bash
git clone <frontend-repo-url>
cd teledent-frontend
npm install

```

### Environment Configurations

Create a `.env.local` file in the root configuration directory and map the necessary external service values:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_TWILIO_VIDEO_TOKEN_URL=your_backend_twilio_endpoint
STITCH_API_KEY=your_stitch_mcp_secret_token

```

### Running the Environment

Fire up the local development environment server:

```bash
npm run dev

```

Open [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000) inside your web browser to view the active application instances.