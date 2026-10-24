# trustvault
TrustVault is a secure document-sharing platform that helps organizations manage confidential files through authentication, role-based access control, document preview and download, instant permission revocation, and activity tracking. Its hash-chain verification helps detect audit tampering, enhancing security, transparency, and accountability.
# 🔐 TrustVault — Secure Document Sharing Platform

### Secure Document Sharing with Access Control and Audit Trails

TrustVault is a secure document-sharing platform designed to help organizations manage, share, and access documents while maintaining control over permissions and user access. It aims to protect sensitive files, support workspace-based collaboration, and improve accountability through audit trails.

---

## 📌 Project Overview

Organizations often share confidential documents among employees and teams. Without proper access controls, documents may be accessed by unauthorized users, and it can be difficult to track who accessed or modified a file.

TrustVault addresses these challenges by providing a centralized platform for document management, workspace-based access, and secure file handling.

### 🎯 Objectives

- Provide secure document storage and sharing.
- Manage users and company workspaces.
- Restrict document access based on permissions.
- Support document uploading, previewing, and downloading.
- Improve accountability through audit-trail functionality.
- Provide a simple, responsive user interface.

---

## ✨ Key Features

- **User Authentication** — Login and registration functionality.
- **Workspace Management** — Organize users and documents by workspace.
- **Document Management** — Upload, list, preview, download, and delete documents, subject to permissions.
- **Role-Based Access Control** — Restrict operations according to user roles and permissions.
- **Secure File Storage** — Designed to use private cloud storage for document files.
- **Audit Trail** — Support tracking document-related activities where implemented.
- **Admin Dashboard** — Provide workspace and user management features.
- **Search and Filtering** — Help users locate documents efficiently.
- **Responsive UI** — Provide a user-friendly interface across different screen sizes.

> Note: Feature availability depends on the current implementation. Verify each feature in the deployed application before describing it as fully functional.

---

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | React |
| Programming Language | TypeScript |
| Frontend Build Tool | Vite |
| Backend | Node.js |
| API Framework | Express.js |
| Database | PostgreSQL |
| ORM | Prisma |
| File Storage | Supabase Storage |
| Backend Hosting | Render |
| Version Control | Git and GitHub |

---

## 🏗️ System Architecture

```text
                 ┌─────────────────────────┐
                 │       User / Admin      │
                 └────────────┬────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │ React + TypeScript UI   │
                 │      (Vite)             │
                 └────────────┬────────────┘
                              │ API Requests
                              ▼
                 ┌─────────────────────────┐
                 │ Node.js + Express API   │
                 │ Authentication & Access │
                 │       Validation        │
                 └────────┬────────┬───────┘
                          │        │
                 ┌────────▼───┐  ┌─▼────────────────┐
                 │ PostgreSQL │  │ Supabase Storage │
                 │  + Prisma  │  │  Document Files │
                 │ Metadata   │  │                 │
                 └────────────┘  └──────────────────┘
```

### How It Works

1. Users interact with TrustVault through the frontend.
2. The frontend sends requests to the backend API.
3. The backend authenticates users and checks their permissions.
4. PostgreSQL stores application data and document metadata.
5. Supabase Storage stores document file contents when the storage integration is configured.
6. The backend returns authorized responses to the frontend.

---

## 📂 Project Structure

The repository is organized into frontend and backend components.

```text
TrustVault/
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── App.tsx
│   │   └── App.css
│   └── package.json
│
├── server/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── utils/
│   │   └── index.ts
│   └── package.json
│
├── README.md
└── prompts.md
```

*The structure above is illustrative. Folder and file names may differ in the current repository.*

---

## ⚙️ Getting Started

### Prerequisites

Install the following tools before running the project:

- Node.js and npm
- Git
- A PostgreSQL database
- A Supabase project if using Supabase Storage
- A code editor such as Visual Studio Code

### 1. Clone the Repository

```bash
git clone https://github.com/Sravanth-009/TrustVault.git
cd TrustVault
```

### 2. Install Dependencies

Install frontend dependencies:

```bash
cd client
npm install
```

Install backend dependencies:

```bash
cd ../server
npm install
```

### 3. Configure Environment Variables

Create the environment files required by the frontend and backend.

Example backend configuration:

```env
DATABASE_URL=your_postgresql_connection_string
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
PORT=5000
```

Example frontend configuration:

```env
VITE_API_URL=http://localhost:5000
```

**Important security notes:**

- Replace example values with your actual configuration.
- Never commit `.env` files or credentials to GitHub.
- Keep `SUPABASE_SERVICE_ROLE_KEY` exclusively on the trusted backend.
- Never expose database passwords or service-role keys in frontend code.
- Use the exact environment variable names expected by your application.

### 4. Set Up the Database

From the backend directory, configure Prisma according to the project's existing setup.

For a standard Prisma project, the following commands may apply:

```bash
npx prisma generate
npx prisma migrate deploy
```

Check the existing Prisma configuration and migration setup before running these commands. Do not run migrations blindly against production data.

### 5. Start the Backend

From the `server` directory, run the development command configured in `server/package.json`. For example:

```bash
npm run dev
```

If the project uses a different script, use the script defined in its package file.

### 6. Start the Frontend

Open another terminal:

```bash
cd client
npm run dev
```

Open the local address displayed by Vite in your terminal.

---

## 🔒 Security Considerations

TrustVault is designed around secure document access and workspace isolation.

Important security practices include:

- Authenticate users before allowing protected operations.
- Verify workspace membership and document permissions on the backend.
- Validate user input and uploaded files.
- Keep private documents in a non-public storage bucket.
- Never expose service-role keys or database credentials to the frontend.
- Avoid returning internal stack traces or sensitive server paths to users.
- Protect audit records from unauthorized modification.
- Ensure that users cannot access another workspace's documents by changing request IDs.

These controls should be verified through code review and testing before the application is used for sensitive production documents.

---

## 🧪 Testing Checklist

Use the following checklist to verify the application's functionality.

- [ ] Registration validates user input.
- [ ] Login works with valid credentials.
- [ ] Invalid credentials produce an appropriate error.
- [ ] Workspace access is restricted to authorized members.
- [ ] Documents can be uploaded successfully.
- [ ] Uploaded documents appear in the document list.
- [ ] Document previews load correctly.
- [ ] Authorized users can download documents.
- [ ] Unauthorized users cannot access protected documents.
- [ ] Document deletion handles the database record and stored file correctly.
- [ ] Search and filtering work as expected.
- [ ] Audit events are recorded for the activities implemented.
- [ ] The deployed frontend can communicate with the backend.

Only mark an item as complete after testing it.

---

## 🚀 Deployment

The application can be deployed using the following services, subject to the current project configuration:

- **Frontend:** A supported static web hosting service.
- **Backend:** Render.
- **Database:** PostgreSQL.
- **Document Storage:** Supabase Storage.
- **Source Code:** GitHub.

Before deployment:

1. Configure the required environment variables.
2. Verify the production database connection.
3. Confirm the frontend API URL.
4. Check CORS settings.
5. Verify that the storage bucket is private.
6. Deploy the latest committed source code.
7. Test uploads, previews, downloads, permissions, and error handling in production.

---

## ⚠️ Current Limitations

The following items should be checked against the actual implementation before submission:

- Some features may require further testing or debugging.
- Document previews depend on the deployed storage implementation and valid file objects.
- Email invitations depend on the configured email-delivery service.
- Audit-trail coverage depends on which events have been implemented.
- Production readiness requires security testing, error handling, and verification of tenant isolation.

Update this section to reflect the application's actual status before publishing the repository.

---

## 🔮 Future Enhancements

Potential improvements include:

- More comprehensive audit logging.
- Expiring document-sharing links.
- Notifications for document access and sharing.
- Stronger authentication options.
- Additional file validation and malware scanning.
- Advanced search and filtering.
- Automated integration and security tests.
- Improved administrative reporting.

---

## 👨‍💻 Development Documentation

See [`prompts.md`](./prompts.md) for a record of AI prompts used or reconstructed during development, including prompts related to implementation, troubleshooting, UI improvements, and deployment.

---

## 📄 License

No license has been specified yet. Add a `LICENSE` file if you intend to distribute this project under an open-source license.

---

## 🙌 Acknowledgements

Developed as a secure document-sharing project for the **Snovasys Fresher Hiring Challenge 2026**.

**TrustVault — Share securely. Control access. Maintain accountability.**
