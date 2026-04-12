# User Guide

This guide walks through every feature of **Network Manager** from the UI. It assumes you already have an instance running and can open it in a browser. For installation see the [README](../README.md). For how the system is built see [DEVELOPER.md](DEVELOPER.md).

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Projects](#2-projects)
3. [Devices](#3-devices)
4. [Subnets](#4-subnets)
5. [Credentials](#5-credentials)
6. [Agents](#6-agents)
7. [Command Outputs](#7-command-outputs)
8. [Network Diagram](#8-network-diagram)
9. [Timeline](#9-timeline)
10. [SQL Query](#10-sql-query)
11. [Activity Logs](#11-activity-logs)
12. [Project Settings](#12-project-settings)
13. [Admin Settings](#13-admin-settings)
14. [Keyboard Shortcuts](#14-keyboard-shortcuts)

---

## 1. Getting Started

Network Manager is a self-hosted tool for keeping track of the devices on a network, the credentials that go with them, the command output you collect from them, and how they all connect together. Everything lives in **projects** (isolated workspaces) so you can keep unrelated networks separate.

### The main layout

When you open the app, you'll see three areas:

- **Sidebar (left)** — navigation for the current project. Includes the project switcher at the top, a link to Admin Settings at the bottom, and a light/dark theme toggle. You can collapse the sidebar with the toggle button at its top.
- **Breadcrumb (top)** — shows where you are (e.g. *Devices › Web Server 01*) and lets you click back up the hierarchy.
- **Main area** — whichever page you're on.

If a notification bar has been configured in Admin Settings, it appears as a coloured strip along the top of the window.

### Finding things fast

- **Global search** — press `Ctrl+K` (or `Cmd+K` on Mac) anywhere to open a modal that searches devices, subnets, credentials, and agents across the current project. Type at least two characters, use arrow keys to move through results, `Enter` to jump to one, `Escape` to close.
- **Keyboard shortcuts** — press `?` anywhere outside a form field to see the full shortcut cheat sheet.

### Light / dark theme

Use the sun/moon toggle at the bottom of the sidebar to switch themes. Your choice is remembered in this browser.

### First launch

On first launch the app creates a project called **Default** and redirects you to it. Everything you create afterwards goes into that project until you make another one from Admin Settings and switch to it.

---

## 2. Projects

A **project** is a complete, isolated workspace. Devices, subnets, credentials, diagrams, agents, command outputs, timeline entries, activity logs — everything is scoped to one project. Deleting a project deletes all of its contents.

### Switching projects

Click the project name at the top of the sidebar to open the project switcher. You can type to filter the list, then click one to switch. The app remembers the last project you used, so the next time you open it you'll land back there.

When the sidebar is collapsed, the project appears as a short 2-letter badge (the project's "short name"). Click it to open the same switcher as a flyout menu.

### Creating, editing, deleting

Project CRUD lives in [Admin Settings](#13-admin-settings). You need:

- **Name** — anything you like
- **Slug** — lowercase, hyphens only; appears in the URL (`/p/<slug>/...`)
- **Short name** (optional) — up to 2 characters, used in the collapsed sidebar

Deleting a project wipes all of its data. You will be asked to type the project name to confirm. The app refuses to delete the last remaining project.

### The Overview page

Every project has an **Overview** page (`/p/<slug>/overview`) with:

- Stats cards for device count, favourited devices, subnets and credentials
- A rich-text description panel you can edit in place (click the pencil to start editing, save or cancel with the buttons)
- An editable title for the description panel (useful if "About" doesn't fit the project)

Use this as a dashboard and as a place to write down what this project is actually for.

---

## 3. Devices

Devices are the heart of the app. Everything else — IPs, credentials, command outputs, ports, images — hangs off them.

### The device list

`Devices` in the sidebar takes you to a paginated table of every device in the current project (50 per page).

**Columns** (toggle and reorder with a right-click on the header, drag to rearrange):

| Column | Default |
|---|---|
| Status dot | Shown |
| Name | Shown, locked |
| Type | Shown |
| Hosting | Shown |
| IP address (primary) | Shown |
| OS | Shown |
| Subnet | Shown |
| MAC | Hidden |
| Hostname | Hidden |
| Domain | Hidden |
| Location | Hidden |
| Tags | Shown |
| AV | Shown (shield icon if set) |
| Credentials | Shown (key icon if any linked) |
| Notes | Shown (truncated) |

Your column choices and order are saved per project in this browser.

**Sorting** — click any sortable header to sort, click again to reverse.

**Searching** — the search box filters by name, type, OS, subnet, IP, tag and so on. Pagination and sort are preserved.

**CSV export** — the download button dumps the current filtered/sorted list as CSV.

### Adding a device

Click **Add Device** (top-right of the list). You'll land on a form with:

- **Name** (required)
- **Type** (required) — one of Server, Workstation, Router, Switch, NAS, Firewall, Access Point, IoT Device, Camera, Phone
- **MAC**, **OS**, **Hostname**, **Domain**, **Location**, **AV** (antivirus), **Status** — all optional
- **Notes** — plain text
- **Subnet** — pick one or leave blank
- **Hosting type** — Baremetal, VM or Hypervisor. If you pick VM, a **Hypervisor** dropdown appears where you can link it to the host device.
- **IP addresses** — add as many as you want, each with an optional label; mark one as primary (it's what shows up in the device list)
- **Tags** — free-form tag pills, use Enter or comma to commit

**Section configuration** — at the bottom of the form you can choose which sections to show on this device's detail page, and in what order. The choices (Overview, Credentials, Ports, Notes, Gallery, Attachments, Command Outputs) are saved per device.

Leaving the page with unsaved changes prompts you to confirm.

### The device detail page

Clicking a device opens its detail view with a stack of sections (in the order you configured):

- **Overview** — type, hosting, OS, hostname, domain, MAC, location, subnet, AV, status, tags, notes, IP list. If the device is a VM, its hypervisor is shown as a clickable link. If it's a hypervisor, a **Virtual Machines** table lists the VMs it hosts.
- **Credentials** — credentials linked to this device. Add a new one inline with the **Add Credential** button (opens a modal), or click the pencil to edit one. See [Credentials](#5-credentials).
- **Ports** — add, edit, and delete discovered ports. Each port has a number (1–65535), state (typically OPEN / CLOSED / FILTERED, but free text), and optional service name.
- **Notes** — a rich-text editor for free-form notes about this device. Save with the button.
- **Gallery** — upload images for this device (JPG, PNG, GIF, WebP, SVG; up to 5 MB each). Click an image to open a lightbox; use arrow keys to navigate, `Escape` to close.
- **Attachments** — upload arbitrary files (up to 10 MB each), download them back, or delete them. Useful for config dumps, rack photos, floor plans.
- **Command outputs** — see [Command Outputs](#7-command-outputs).

Use the **Edit** button to open the device form, and **Delete** (with confirmation) to remove it. Deleting a device also removes its IPs, tags, ports, images, attachments and credentials.

### Importing devices

The **Upload** button on the device list opens a menu with three import flows:

#### CSV import

1. Click **CSV import**.
2. Either upload a `.csv` file or paste CSV text. The first row must be a header.
3. Columns recognised: `name` (required), `type`, `ip_address`, `mac_address`, `os`, `hostname`, `domain`, `location`, `tags`.
4. A **Download template** button gives you a correctly-formatted starter file.
5. Click **Preview** to validate without writing. You'll see a row-by-row table showing which fields are valid and which will be skipped.
6. Click **Apply** to create the devices in a single transaction.

#### PCAP import

1. Click **PCAP import**.
2. Upload a `.pcap` or `.pcapng` capture file (up to 10 MB).
3. The server parses it and returns every host it saw, with IP, MAC addresses, open ports and a packet count.
4. Each host shows a **match** — either "new device" or an existing device it thinks this one is. For each, pick **Create**, **Merge** (with a chosen existing device) or **Skip**.
5. Click **Apply** to commit your choices.

#### ARP import

Same flow as PCAP, but you paste the output of `arp -avn`, `arp -a`, or plain `arp` instead of uploading a file. Use this when you have a command output but no capture.

---

## 4. Subnets

Subnets group devices logically. They show up as containers on the network diagram and as filters everywhere else.

### The subnet list

Paginated table of every subnet in the project, sortable by name, CIDR, VLAN ID and description. Search works across all columns. CSV export is available.

### Adding a subnet

Click **Add Subnet**. Fields:

- **Name** (required)
- **CIDR** (required) — IPv4 (e.g. `192.168.1.0/24`) or IPv6 (e.g. `fd00::/64`). The form rejects invalid formats.
- **VLAN ID** (optional) — integer 0–4094
- **Description** (optional)

### Subnet detail

Clicking a subnet shows its name, CIDR, VLAN, description, creation date and a table of member devices. Click a device row to jump to its detail page.

Use the **Edit** button to modify and **Delete** to remove (cascades the device memberships and any connections touching the subnet).

---

## 5. Credentials

Store passwords, keys and connection info for your devices.

### The credential list

Paginated table with the following columns:

- Device name (linked)
- Host / IP
- Username
- Password (masked — use the eye icon to reveal)
- Type — one of `SSH`, `RDP`, `HTTP`, `SNMP`, `SQL`, `VPN`, `SSH Key`, `Other`
- Source — free-text note about where this credential came from
- Action icons: edit, delete, toggle hidden

Filters at the top:

- **Used / unused / all** — mark credentials you've already tried or used so you can ignore them later
- **Hidden / visible / all** — hide sensitive credentials from the default view (toggle with the eye/eye-off icon on a row)

Search filters by device name, host, username, type, and source.

### Adding / editing a credential

The form has:

- **Device** (optional) — pick a device to link this credential to
- **Host** — auto-filled from the device's primary IP if you picked one, otherwise enter manually
- **Username** (required)
- **Password**
- **Type** — from the whitelist above
- **Source** — free text
- **Used** — checkbox
- **File** — for `SSH Key` and `VPN`, you can attach a file (e.g. the private key or `.ovpn` config). Max 5 MB.

When editing an existing credential, a **Remove file** button appears if one is attached.

### Viewing / downloading files

On a file credential, click the filename to open a modal that shows the file content (as text) with a **Download** button. Useful for copying SSH keys or VPN configs.

---

## 6. Agents

**Agents** are the monitoring or security tools running on your devices — Wazuh, Zabbix, ELK, Prometheus, Grafana, Nagios, Datadog, Splunk, OSSEC, or a custom entry. The agent section lets you inventory them, link them to devices, and keep notes.

### The agent list

Paginated table with columns for status, name, type, device, device OS, check-in schedule, version, disk path (hidden by default) and notes (hidden by default). Sortable and searchable. CSV export is available.

### Adding an agent

- **Name** (required)
- **Type** (required) — from the whitelist above
- **Device** (optional) — link to a device
- **Check-in schedule** — free text, e.g. "every 5 minutes"
- **Config** — free text, often JSON
- **Disk path** — where the agent is installed on disk
- **Status** — Active, Inactive, Error, Unknown
- **Version**
- **Notes** — rich text

### Agent detail

Shows everything you entered, with a **Copy** button next to the disk path so you can paste it into an SSH session.

---

## 7. Command Outputs

Paste the raw output of common Linux commands and get structured, searchable tables back. Access this from the **Command outputs** section on a device's detail page.

### Supported commands

| Command type | What you paste | Parsed into |
|---|---|---|
| `ps` | `ps aux` | Process table (PID, user, %CPU, %MEM, command) |
| `netstat` | `netstat -tulpn` or `ss -tulpn` | Connections table |
| `last` | `last` | Login history |
| `ip a` | `ip a` / `ip addr` | Interfaces with IPs and MAC |
| `ip r` | `ip r` / `ip route` | Routing table |
| `arp` | `arp -an`, `arp -a`, `arp -avn` | ARP entries |
| `mount` | `mount` | Mounted filesystems |
| `systemctl status` | `systemctl list-units --type=service` | Services |
| `freeform` | anything | Stored as raw text, no parsing |

### Submitting output

1. Pick a command type tab.
2. (Optional) give the output a title — e.g. "Web server after patch".
3. Paste the raw text into the textarea.
4. Leave **Parse output** ticked to get the parsed table, or untick it to store the raw text only (use this if the command isn't a clean match for any of the parsers).
5. Click **Submit**. The capture timestamp is set to "now" automatically.

If the parser can't make sense of the input, the whole submission is rejected with the error message — nothing is half-written to the database.

### Viewing past outputs

The section sidebar lists all outputs for this device, grouped by command type, most recent first. Click one to view:

- The raw text
- The parsed table (if parsing is on)
- A **diff** option to compare with the previous output of the same type

Timestamps respect the project timezone set in Admin Settings.

### Editing

- Change the title and toggle parsing on/off with the edit (pencil) button
- Delete an output with the trash button; this also removes its parsed rows

### Highlight rules

If you've defined [highlight rules](#12-project-settings) at the project level, keywords in the raw text will be coloured according to your rules — useful for spotting errors or categories at a glance.

---

## 8. Network Diagram

The diagram is where the rest of the app visually comes together. Open it from **Network Diagram** in the sidebar.

### Basic navigation

- **Drag** empty space to pan
- **Scroll** to zoom in and out
- **Fit view** button re-centres everything
- **Lock / unlock** button in the toolbar — when locked, dragging, selecting and connecting are disabled so you can't accidentally nudge anything

### Adding things to the diagram

Devices and subnets exist independently of the diagram — you have to explicitly add them. Use the toolbar buttons:

- **Add device** — dropdown of devices not yet on the current view
- **Add subnet** — dropdown of subnets not yet on the current view
- **Add annotation** — drops a text label at the centre; double-click to edit
- **Add image** — open the image library to pick one, or upload a new image

Once added, drag them wherever you like. Positions are saved automatically 500 ms after you stop dragging.

### Nesting devices in subnets

Dragging a device into a subnet group parents it to that subnet — the device then moves with the subnet, and its position is constrained inside. Devices that belong to a subnet but aren't parented show a dashed grey line to their subnet instead.

You can resize subnet groups by dragging their corners.

### Drawing connections

With the diagram unlocked, drag from one of a device's **handles** (the dots on the top and bottom of the node) to another device's handle. You can also connect device↔subnet and subnet↔subnet. Click the new edge to edit it in the Properties Panel.

### The Properties Panel

Select a node or edge (click it) and the right-side panel shows styling options:

**For devices / subnets**:

- Border colour, fill colour, label colour
- Border style (solid, dashed, dotted)
- Border radius (square, small, rounded, pill)
- Border width (thin, normal, thick)
- Custom icon (emoji / glyph)
- Favourite toggle (adds a star to the node)
- A link to the device/subnet detail page

**For edges**:

- Label
- Connection type, edge type
- Edge colour, edge width
- Label colour, label background colour
- Source and target handle / port info

### Custom icons

Three places to change icons, in order of precedence:

1. **Per-device override** — set via the Properties Panel. Highest priority.
2. **Project type default** — set in [Project Settings](#12-project-settings). Applies to every device of that type in the project.
3. **Built-in SVG** — the fallback.

You can also attach project images via the **Image Library** (Project Settings) and drop them onto the diagram.

### Toolbar at a glance

- Lock / unlock
- Add device / subnet / annotation / image
- Auto-layout (runs a Dagre algorithm to arrange everything)
- Undo / redo (also `Ctrl+Z` / `Ctrl+Shift+Z`)
- Grid toggle
- Edges visibility toggle
- Credentials indicator toggle (the little key icon on devices)
- Legend toggle
- Minimap toggle
- Export (JSON, PNG, SVG)
- Import (JSON)
- Fullscreen

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Z` | Undo (up to 50 steps) |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+A` | Select all |
| `Delete` / `Backspace` | Remove selected from diagram (does **not** delete the underlying device/subnet) |

### Diagram views

You can save multiple named **views** per project — each view has its own node positions, annotations, images and styling. Use views to show different perspectives (e.g. "Physical layout", "Logical trust zones", "Internet-facing only") without duplicating data.

Switch views from the dropdown in the toolbar; create, rename and delete views from the same menu. The **default view** is the one the diagram opens to.

### Export and import

- **Export JSON** downloads the complete diagram state as a JSON file — useful for backups or moving layouts between projects.
- **Import JSON** uploads a previously exported file. Devices and subnets are matched to existing ones **by name**; you'll see a summary of how many matched vs how many couldn't be matched.
- **Export PNG / SVG** renders the current diagram to an image file for reports or screenshots.

---

## 9. Timeline

The **Timeline** page is a project-level log of events — use it to record incidents, decisions, changes, maintenance windows, milestones, and freeform notes.

### The list

Entries are shown in reverse chronological order with:

- Title
- Category (colour-coded)
- Date/time (respects the project timezone)
- Description (rich text)

Filter by:

- **Search** — matches title and description
- **Category** — General, Decision, Change, Incident, Milestone, Note
- **From / To** — date range picker

### Adding an entry

Click **Add entry** to open the modal form:

- **Title** (required)
- **Category** (required)
- **Date / time** — defaults to now, but you can set any date
- **Description** — rich text

Edit or delete an entry with the pencil / trash buttons on each row.

---

## 10. SQL Query

If you need to answer a question the built-in pages don't cover, **SQL Query** gives you direct read-only access to your project's data.

### Running a query

Type SQL into the textarea and click **Run**, or press `Ctrl+Enter`. Results are rendered as a table with column headers and a row count. If the result exceeds 1000 rows, it's truncated and a warning is shown.

### Safety rails

- **Read-only connection** — no `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE`, `ALTER`, `ATTACH`, etc. The server rejects them with a 400 before they touch the database.
- **Single statement only** — semicolons in the body are rejected.
- **Project-scoped** — use `$projectId` as a literal placeholder in your query and it will be substituted with the current project's ID automatically. This is how you filter to the current project.

### Suggested queries

The sidebar has a set of one-click starter queries:

- Hosts with root credentials
- Devices without credentials
- Open ports by device
- Subnet device counts
- VM to hypervisor mapping
- Credentials summary by type
- Devices with AV
- Devices without AV
- All domains

Clicking one loads it into the editor — edit as needed before running.

---

## 11. Activity Logs

Everything that changes the data is logged. There are two places to look:

- **Project logs** (`/p/<slug>/logs`) — actions inside the current project
- **Admin logs** (`/admin/logs`) — actions across every project, reachable from the sidebar when you're on an admin page

### Filters

Both pages support:

- **Search** — matches the resource name
- **Resource type** — device, subnet, credential, connection, command_output, project, backup, settings, agent, timeline, etc.
- **Action** — created, updated, deleted, exported, imported
- **Pagination** — 50 entries per page, up to 500 per page via the limit selector

### Columns

- Timestamp (in project timezone)
- Action (colour-coded)
- Resource type
- Resource name (what was changed)
- Details — extra context depending on the action. For backups this includes the scope and which toggles were set; for command output captures it shows the command type; etc.

Timeline entries and log entries are **not** the same thing — the timeline is user-written history, the log is automatic audit trail.

---

## 12. Project Settings

`Settings` in the sidebar, scoped to the current project.

### Highlight rules

Create keyword → colour rules that apply wherever raw command output is rendered. For each rule:

- **Keyword** — the substring to match
- **Category** — a label (e.g. "Error", "Warning", "Root")
- **Color** — background colour
- **Text color** (optional) — foreground colour

Rules apply project-wide to every command output viewer.

### Device type icons

Upload a custom icon for any of the 11 device types (Server, Workstation, Router, Switch, NAS, Firewall, Access Point, IoT, Camera, Phone, Hypervisor). These override the built-in SVG defaults for every device of that type on the diagram. Supported formats: JPG, PNG, GIF, WebP, SVG. Delete to revert to the default.

### Backup and restore

- **Export** — download a JSON backup of the current project. Toggles let you include or exclude:
  - Credentials
  - Command outputs
- **Import** — upload a previously-exported project JSON to restore it. Existing data is replaced, not merged, so take a backup first.

Backups are stored nowhere on the server — the download goes straight to your browser.

---

## 13. Admin Settings

`/admin` — system-wide configuration, reached from the sidebar.

### Projects

Create, edit and delete projects (see [Projects](#2-projects) for fields).

### Timezone

Global timezone picker. Affects how every timestamp is rendered across the app (command output capture time, activity log, timeline, etc.).

### Notification bar

A persistent coloured strip at the top of the app, useful for banners like "Read-only mode" or "Maintenance at 22:00". Settings:

- Enabled toggle
- Text
- Background colour, text colour
- Height
- Font size
- Bold toggle

### Full-site backup

- **Export** — downloads a JSON backup of **every** project in the instance. The same toggles as a per-project backup are available.
- **Import** — restores a full-site backup from a JSON file.

Use full-site backups before major version upgrades or when moving the instance to a new host.

---

## 14. Keyboard Shortcuts

Press `?` anywhere (outside a form field) to see the in-app list. The most useful shortcuts:

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + K` | Open global search |
| `?` | Open the shortcut cheat sheet |
| `Ctrl + Z` | Undo (diagram) |
| `Ctrl + Shift + Z` | Redo (diagram) |
| `Ctrl + A` | Select all (diagram) |
| `Delete` / `Backspace` | Remove selected items from diagram |
| `Ctrl + Enter` | Run query (SQL Query page) |
| `Escape` | Close any open modal |
| `Tab` / `Shift+Tab` | Cycle focus inside a modal (trapped) |
