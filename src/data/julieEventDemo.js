export const CAPABILITY_LEVELS = {
  live: "LIVE NOW",
  pilot: "PARTIAL / PILOT",
  proposed: "PROPOSED NEXT",
};

export const julieEventDemo = {
  id: "event-floor-manager-introduction",
  title: "Event Floor Manager",
  eyebrow: "A live event story",
  event: {
    title: "Nordic Leadership Forum",
    client: "Demo event",
    venue: "Atrium + Workbar",
    guests: 120,
    window: "16:00–22:30",
  },
  standards: [
    {
      id: "bar",
      title: "Bar setup",
      detail: "Fast sellers forward · glassware aligned · restock route clear",
      referenceLabel: "Reference image / bar setup standard",
    },
    {
      id: "coffee",
      title: "Coffee station",
      detail: "Cups · milk · sugar · tea · coffee · waste point",
      referenceLabel: "Reference image / self-service standard",
    },
    {
      id: "reset",
      title: "Room reset",
      detail: "Table spacing · chair line · water placement · clear guest flow",
      referenceLabel: "Reference image / table reset standard",
    },
  ],
  responsibilities: [
    { role: "Overall shift lead", owner: "Bobby", initials: "BO" },
    { role: "Event responsible", owner: "Julie", initials: "JU", emphasis: true },
    { role: "Closing responsible", owner: "Ivana", initials: "IV" },
    { role: "Cash / invoice", owner: "Rebekka", initials: "RE" },
    { role: "Locking / alarm", owner: "Vlad", initials: "VL" },
    { role: "Asset check", owner: "Mircea", initials: "MI" },
  ],
  runbookPhases: [
    "PREP",
    "SETUP",
    "DOORS",
    "GUEST ARRIVAL",
    "SERVICE",
    "SPEECH",
    "TECH CUE",
    "CHANGEOVER",
    "BREAK",
    "LAST CALL",
    "TEARDOWN",
    "SETTLEMENT",
    "LOCK / ALARM",
  ],
  chapters: [
    {
      id: "opening",
      number: "00",
      label: "Opening",
      title: "Your event, live.",
      scene: "opening",
      durationSeconds: 9,
      capability: CAPABILITY_LEVELS.live,
      uiSummary: "From event plan to operational state",
      caption:
        "An event plan is useful. An event plan that knows what is ready, what is late, who owns it, and what happens next is operational.",
    },
    {
      id: "before-doors",
      number: "01",
      label: "Before doors",
      title: "Readiness, without the rounds of questions.",
      scene: "readiness",
      durationSeconds: 14,
      capability: CAPABILITY_LEVELS.live,
      uiSummary: "Event card · readiness · dependencies · critical confirmation",
      caption:
        "Before doors, Julie can see the event, its timing, every setup dependency, and the critical confirmations still missing. She does not need to carry the whole plan in her head, or ask the same question twice.",
    },
    {
      id: "standards",
      number: "02",
      label: "Point-of-work standards",
      title: "The standard travels with the task.",
      scene: "standards",
      durationSeconds: 14,
      capability: CAPABILITY_LEVELS.pilot,
      uiSummary: "Rich instructions · visual reference slots · repeatable setup",
      caption:
        "A task can explain exactly what good looks like, at the point of work. The reference areas are ready for approved setup photos, so a new team member can work to the same standard without waiting for a manager.",
    },
    {
      id: "ownership",
      number: "03",
      label: "Who owns what",
      title: "Leadership is not the same as owning everything.",
      scene: "ownership",
      durationSeconds: 12,
      capability: CAPABILITY_LEVELS.live,
      uiSummary: "One event lead · six explicit responsibilities",
      caption:
        "Julie leads the event. That does not automatically make her responsible for closing, settlement, locking, or every asset. Mesh makes each responsibility explicit before it can become an assumption.",
    },
    {
      id: "during-event",
      number: "04",
      label: "During the event",
      title: "When the plan changes, the operation changes with it.",
      scene: "live-control",
      durationSeconds: 14,
      capability: CAPABILITY_LEVELS.pilot,
      uiSummary: "Now · next · exceptions · acknowledgement · handover context",
      caption:
        "During service, progress and exceptions stay visible. If something changes, the information moves with the operation. It does not stay in one person’s head or disappear into a verbal message.",
    },
    {
      id: "financial-control",
      number: "05",
      label: "Financial control",
      title: "A clear owner. A clear state.",
      scene: "financial",
      durationSeconds: 9,
      capability: CAPABILITY_LEVELS.live,
      uiSummary: "Cash / invoice · settlement checks · responsible sign-off",
      caption:
        "Important financial closeout stays fast and operational. The right person confirms the checks, records settlement, and signs off. Everyone else can see the state without turning the floor into an accounting office.",
    },
    {
      id: "assets",
      number: "06",
      label: "Asset control",
      title: "Equipment cannot quietly disappear.",
      scene: "assets",
      durationSeconds: 12,
      capability: CAPABILITY_LEVELS.pilot,
      uiSummary: "Location · condition · charging · serial · needs attention",
      caption:
        "Payment terminals and shared devices are checked where they belong. Missing, damaged, misplaced, or uncharged equipment becomes visible while there is still time to act.",
    },
    {
      id: "closeout",
      number: "07",
      label: "Closeout",
      title: "Closed means closed.",
      scene: "closeout",
      durationSeconds: 10,
      capability: CAPABILITY_LEVELS.live,
      uiSummary: "Final tasks · critical checks · calm completion",
      caption:
        "At the end, Julie is not leaving with a vague sense that things were probably done. Closeout gives her a calm, verifiable finish: the event is closed, responsibilities are signed, and the next shift has what it needs.",
    },
    {
      id: "management",
      number: "08",
      label: "Management visibility",
      title: "Visibility without interrupting the floor.",
      scene: "management",
      durationSeconds: 10,
      capability: CAPABILITY_LEVELS.pilot,
      uiSummary: "Progress · exceptions · handovers · sign-offs · history",
      caption:
        "Management can zoom out to see progress, missing and critical work, handovers, alerts, ownership, sign-offs, history, and asset issues. The floor keeps moving; leadership keeps control.",
    },
    {
      id: "runbook",
      number: "09",
      label: "Live event runbook",
      title: "The next step: operate the run-of-show.",
      scene: "runbook",
      durationSeconds: 16,
      capability: CAPABILITY_LEVELS.proposed,
      uiSummary: "From static document to live, event-specific operating plan",
      caption:
        "The next step is a complete live runbook: exact cues, owners, dependencies, notes, changes, blockers, references, and escalation in one event-specific plan. A run-of-show should not remain trapped in a Word file, PDF, or paper sheet. It should be operated by the same team, in the same system, throughout the event.",
    },
    {
      id: "final",
      number: "10",
      label: "Ready",
      title: "Less chasing. Less guessing. More control on the floor.",
      scene: "final",
      durationSeconds: 8,
      capability: CAPABILITY_LEVELS.live,
      uiSummary: "The event story is ready to explore",
      caption:
        "Mesh Shift Log is not another checklist. It is an operational execution layer: clearer ownership, faster onboarding, stronger handovers, and live control from preparation to closeout.",
    },
  ],
};

export const julieDemoCapabilityMap = [
  {
    capability: "Event cards, readiness and event task states",
    level: CAPABILITY_LEVELS.live,
    constraint: "Available in the current Event Floor Manager and event operations views.",
  },
  {
    capability: "Rich task guidance and visual standard references",
    level: CAPABILITY_LEVELS.pilot,
    constraint: "Guides and reference slots exist; approved production setup photos still need to be supplied.",
  },
  {
    capability: "Role and responsibility assignments",
    level: CAPABILITY_LEVELS.live,
    constraint: "Current role models support distinct owners; backend event roles require configured Supabase Auth.",
  },
  {
    capability: "Live tasks, exceptions, alerts, changes and handovers",
    level: CAPABILITY_LEVELS.pilot,
    constraint: "Implemented for authenticated event operations; Realtime and notification behavior depend on backend configuration and browser permission.",
  },
  {
    capability: "Cash / invoice checks and sign-off",
    level: CAPABILITY_LEVELS.live,
    constraint: "Email-authenticated users sync to Supabase; staff-code use remains a local fallback.",
  },
  {
    capability: "Payment terminal and POS / iPad asset checks",
    level: CAPABILITY_LEVELS.pilot,
    constraint: "Registry and checks are implemented with authenticated sync plus local fallback; production rollout remains a controlled pilot.",
  },
  {
    capability: "Event closeout and completion history",
    level: CAPABILITY_LEVELS.live,
    constraint: "Current closeout checks and event completion state are available; data durability depends on the user’s authenticated or fallback mode.",
  },
  {
    capability: "Manager overview and operational history",
    level: CAPABILITY_LEVELS.pilot,
    constraint: "Current dashboards and cockpit provide visibility; some older/local modules are not yet fully unified in backend history.",
  },
  {
    capability: "Full event-specific live runbook / kjøreplan",
    level: CAPABILITY_LEVELS.proposed,
    constraint: "A unified run-of-show foundation exists. The document-complete timeline, dependency graph, attachments, setup photos and escalation model shown in the vision chapter are the proposed next step.",
  },
  {
    capability: "Google Calendar import",
    level: CAPABILITY_LEVELS.pilot,
    constraint: "Current authenticated import/linking code exists and requires configured Supabase functions and provider access.",
  },
  {
    capability: "Push notifications",
    level: CAPABILITY_LEVELS.proposed,
    constraint: "There are browser event-task alerts and urgent alert email paths, but no complete production push-notification service.",
  },
];

export const julieDemoRuntimeSeconds = julieEventDemo.chapters.reduce(
  (total, chapter) => total + chapter.durationSeconds,
  0,
);
