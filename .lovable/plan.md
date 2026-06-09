## Husada CRM — Lovable Cloud + Fonnte API

Membangun ulang CRM Husada (originalnya Next.js + Prisma + WAHA) di stack Lovable (TanStack Start + Lovable Cloud). WAHA diganti **Fonnte**, ditambah **Settings → Fonnte** untuk input API key + test koneksi, plus **live chat realtime mirroring**.

### Stack
- Frontend: TanStack Start + shadcn/ui + Tailwind
- Backend: Lovable Cloud (Postgres + Auth + Edge Functions + Realtime)
- WhatsApp: Fonnte API (`https://api.fonnte.com`)

### Database (Supabase, semua dengan RLS + GRANTs)
- `profiles` (id ref auth.users, full_name, whatsapp_number, avatar_url)
- `user_roles` (user_id, role: super_admin/admin/agent) — pakai security-definer `has_role()`
- `stages` (name, color, order_index, is_default, is_terminal)
- `tags`, `contact_tags`
- `products` (name, description, category, is_active)
- `contacts` (whatsapp_number unique, full_name, age, domicile, chief_complaint, stage_id, assigned_agent_id, interested_product_id, chatbot_state, chatbot_data jsonb, last_interaction_at, total_messages, notes)
- `conversations` (contact_id, status OPEN/PENDING/RESOLVED, assigned_agent_id, last_message_at, last_replied_by_id)
- `messages` (conversation_id, direction INBOUND/OUTBOUND, type, content, sent_by_id, sent_at, fonnte_message_id unique, status)
- `templates` (name, content, category)
- `system_settings` (key, value) — termasuk `fonnte_api_key`, `fonnte_device`, `auto_followup_enabled/hours/template`
- `activity_logs`, `assign_history`, `follow_ups`

Semua tabel: GRANTs untuk authenticated + service_role, RLS policy berbasis `has_role()`.

### Edge Functions (Supabase, publik untuk webhook, auth untuk app)
1. `fonnte-test` — POST { api_key } → call `https://api.fonnte.com/validate` → return device status (untuk tombol "Test Koneksi" di Settings).
2. `fonnte-send` — POST { conversation_id, content } → ambil api_key dari settings → call Fonnte `/send` → insert message OUTBOUND. Dipanggil agent dari inbox.
3. `fonnte-webhook` — endpoint publik untuk Fonnte incoming webhook → find/create contact + conversation → insert message INBOUND → jalankan chatbot onboarding (ask_product → ask_name → ask_domicile → done) → trigger Realtime.
4. `fonnte-test-send` — POST { number, message } → kirim ke nomor sendiri buat verifikasi end-to-end di Settings.

### Realtime / Live Chat Mirroring
- Subscribe ke `postgres_changes` di tabel `messages` (filter per `conversation_id`) → UI inbox auto-append message baru tanpa refresh.
- Subscribe ke `conversations` untuk update list sidebar (last_message_at, unread).
- Outbound yang dikirim agent muncul instan di pengirim **dan** di tab lain yang buka conversation sama (mirroring multi-device/multi-agent).
- Indikator "agent X sedang mengetik" optional via broadcast channel (skip MVP).

### Pages (TanStack routes)
- `/auth` — login / signup (Lovable Cloud auth, email+password, auto-confirm)
- `/_authenticated/` layout (redirect ke `/auth` jika belum login)
  - `/dashboard` — stats kartu (total leads, deal, closed, response time)
  - `/leads` — tabel kontak + filter stage + toggle "My Leads" + import/export Excel (export saja di MVP)
  - `/leads/$id` — detail kontak + history percakapan + edit + assign
  - `/inbox` — split view: list conversation + chat panel realtime
  - `/broadcast` — kirim template ke banyak kontak
  - `/settings` — tab: **Fonnte** (api key + test), Users, Products, Stages, Templates, Auto Follow-up
- `/api/fonnte/webhook` (TanStack server route publik) — fallback webhook receiver yang forward ke edge function (atau langsung Fonnte point ke edge function URL).

### Settings → Fonnte (fitur baru, fokus tambahan user)
- Input: API Key (secret) + Device Number
- Tombol **"Test Koneksi"** → call `fonnte-test` → tampilkan status device (connected/disconnected, quota, expired)
- Tombol **"Test Kirim Pesan"** → input nomor + pesan → call `fonnte-test-send` → tampilkan response
- Tampilkan webhook URL yang harus di-paste user ke dashboard Fonnte
- API key disimpan terenkripsi di `system_settings` (server-only read via edge function; tidak pernah dikirim ke browser)

### Chatbot Onboarding (port dari original)
Edge function `fonnte-webhook` jalankan state machine:
1. null → greet + list produk → `ask_product`
2. ask_product → simpan minat → tanya nama → `ask_name`
3. ask_name → simpan nama → tanya domisili → `ask_domicile`
4. ask_domicile → simpan domisili → set `done` → handoff ke agent

### Scope Cut (untuk MVP yang bisa di-deliver & dites)
**Termasuk:** auth, leads CRUD, inbox + realtime live chat mirroring, Fonnte settings + test + send + webhook + chatbot, stages, products, users (roles), basic dashboard stats, export Excel.
**Skip dulu (bisa ditambah berikutnya):** assign WA notification, auto follow-up cron (perlu pg_cron), KPI leaderboard lateral join, broadcast scheduler, import Excel (export saja).

### Testing
- Test koneksi Fonnte via tombol di Settings (butuh user input API key asli dari fonnte.com).
- Mock webhook test via `stack_modern--invoke-server-function` POST ke endpoint webhook publik dengan payload Fonnte → verify message muncul realtime di UI.
- Buka 2 tab inbox → kirim message → mirroring otomatis muncul di kedua tab.

### Catatan
Skala kerjaan ini besar (~30-40 file). Saya bangun bertahap di satu pass: enable Cloud → migrasi DB → edge functions → UI auth & layout → inbox realtime → settings Fonnte → leads → polish. Setelah itu kita testing bareng (Anda kasih API key Fonnte asli untuk test koneksi end-to-end).
