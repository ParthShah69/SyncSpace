# SyncSpace: Collaborative Workspace App

SyncSpace is a real-time collaborative workspace application built as a Progressive Web App (PWA). It provides teams with a unified platform for communication, task management, and document collaboration.

## Tech Stack
-   **Frontend:** Vite, React, TailwindCSS, Zustand (State Management), Socket.IO Client.
-   **Backend:** Node.js, Express, MongoDB (Mongoose), Socket.IO.
-   **Authentication:** JWT (JSON Web Tokens) with HTTP-only cookies, Email OTP (Nodemailer).

## Features Implemented
The application is structured into several core modules. Here is an overview of what has been built:

### 1. Authentication & Security
-   Secure User Registration and Login with JWT authentication.
-   Email OTP verification during registration.
-   "Forgot Password" flow with OTP recovery.
-   Protected API routes prioritizing data isolation.

### 2. Workspaces
-   Users can create multiple isolated workspaces.
-   Members can be invited via secure unique invite links.
-   Role-based access (Owner, Admin, Member).

### 3. Real-Time Chat (Channels)
-   Multiple chat channels within a workspace.
-   Real-time messaging powered by Socket.IO.
-   Typing indicators, read receipts (WhatsApp style), and message deletion.
-   Mobile-friendly scrolling and clean responsive UI.

### 4. Interactive Collaboration Features
-   **Convert to Task:** A core feature allowing users to turn any chat message into an actionable task instantly.
-   **Convert to Note:** Transform important messages into permanent collaborative notes.

### 5. Task & Notes Management
-   **Kanban Task Board:** Organize and move tasks between Todo, In Progress, and Done.
-   **Shared Notes:** A rich-text collaborative document editor for taking notes within the workspace.

### 6. UI/UX
-   Light and Dark Theme support across the entire app.
-   Fully responsive design with collapsible sidebars designed for mobile PWA usage.

## Upcoming / Pending Features
-   **Notifications:** Real-time popup notifications and Web Push API integration for offline alerts.
-   **Search:** Global search across messages, tasks, and notes.
-   **PWA Setup:** Configuring the `manifest.json`, Service Workers, and caching strategies.
-   **Voice Chat:** Future integration for voice channels.
-   **Advanced Task Permissions:** Restricting task movement/editing to the task creator or assigned members.

## Getting Started
To run the app locally:
1.  Clone the repository and run `npm install` in both `frontend` and `backend` directories.
2.  Set up the `.env` variables (MongoDB URI, JWT Secret, Nodemailer credentials).
3.  Run `npm run dev` in both directories to start the Vite frontend and Node.js backend.
