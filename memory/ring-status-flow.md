# 戒指盃狀態流程 — 程式筆記

關於 [GroupsManager.jsx](../client/src/pages/admin/GroupsManager.jsx) 的「Status control」卡片。
同一組 STATUS_FLOW 也用在 [Dashboard.jsx](../client/src/pages/admin/Dashboard.jsx) 的狀態切換器。

> 注意:綠夾克盃**不用**這套流程,它只有 setup → playing → finished 三段,
> 邏輯在 [GjDashboard.jsx](../client/src/pages/gj/GjDashboard.jsx)。

(行號可能已隨改版變動,以實際檔案為準。)

---

Where it lives — lines 118–131, inside the "Status control" card.

What it displays

Label: "目前狀態 Current Status"
Value: the raw status string from the database 
(e.g. setup, picking, playing, revealed, finished), shown capitalized via Tailwind's capitalize class (line 123)
Where status comes from

On load (loadData, line 23–43), it calls GET /tournament and reads t.tournament?.status, defaulting to 'setup' if missing. That's it — no derived logic, it's the stored DB value.

The action button (line 125–130)

The STATUS_FLOW map (lines 5–11) defines the full state machine:

Current	Next	Button label

setup	picking	開放選馬 Open Horse Picking
picking	playing	Lock & Start Game
playing	revealed	Reveal Horse Picks
revealed	finished	Finish Game
finished	(none)	(no button shown)



The button only renders if STATUS_FLOW[status]?.next exists (line 125), so finished shows no button.

handleStatusChange (lines 89–101)

Reads the next status from STATUS_FLOW[status].next
Shows a window.confirm() with a different message depending on which transition
Calls PUT /tournament/status with { status: flow.next }
Updates local status state immediately (optimistic update)