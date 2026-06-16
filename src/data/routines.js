export const staffCodes = [
  { code: '1001', name: 'Bobby', role: 'manager', isManager: true },
  { code: '1002', name: 'Ivana', role: 'staff', isManager: false },
  { code: '1003', name: 'Vlad', role: 'staff', isManager: false },
  { code: '1004', name: 'Rebekka', role: 'staff', isManager: false },
  { code: '1005', name: 'Mircea', role: 'staff', isManager: false },
  { code: 'OPEN', name: 'Time2Staff Opening', role: 'opening team', isManager: false },
  { code: 'CLOSE', name: 'Time2Staff Closing', role: 'closing team', isManager: false },
  { code: 'EVENT', name: 'Time2Staff Event Responsible', role: 'event responsible', isManager: false },
];

export const shiftOptions = [
  { id: 'opening', label: 'Opening shift' },
  { id: 'daytime', label: 'Daytime shift' },
  { id: 'closing', label: 'Closing shift' },
  { id: 'event', label: 'Event shift' },
  { id: 'weekly', label: 'Weekly tasks' },
  { id: 'guides', label: 'Guides / Knowledge base' },
];

export const defaultRoutines = [
  {
    id: 'opening-0700',
    shiftType: 'opening',
    label: 'Opening 07:00-08:00',
    tasks: [
      {
        id: 'open-unlock-main',
        title: 'Unlock main entrance and staff areas',
        description: 'Check that no alarms are active before opening the guest entrance.',
        category: 'Opening 07:00-08:00',
        priority: 'critical',
        inputType: 'yesno',
      },
      {
        id: 'open-lights-music',
        title: 'Turn on lights, music and POS screens',
        category: 'Opening 07:00-08:00',
        priority: 'normal',
      },
      {
        id: 'open-coffee-check',
        title: 'Start coffee station and check milk stock',
        category: 'Opening 07:00-08:00',
        priority: 'important',
        inputType: 'comment',
      },
    ],
  },
  {
    id: 'opening-0800',
    shiftType: 'opening',
    label: 'Opening 08:00-10:00',
    tasks: [
      {
        id: 'open-bookings-review',
        title: 'Review bookings and meeting room plan',
        category: 'Opening 08:00-10:00',
        priority: 'important',
      },
      {
        id: 'open-fridges-temp',
        title: 'Record fridge temperature',
        category: 'Opening 08:00-10:00',
        priority: 'critical',
        inputType: 'number',
      },
      {
        id: 'open-toilets-check',
        title: 'Check toilets and refill essentials',
        category: 'Opening 08:00-10:00',
        priority: 'normal',
      },
    ],
  },
  {
    id: 'lunch-1100',
    shiftType: 'daytime',
    label: 'Lunch 11:00-13:00',
    tasks: [
      {
        id: 'lunch-counter-ready',
        title: 'Prepare lunch counter and labels',
        category: 'Lunch 11:00-13:00',
        priority: 'important',
      },
      {
        id: 'lunch-guest-flow',
        title: 'Watch guest flow and clear tables continuously',
        category: 'Lunch 11:00-13:00',
        priority: 'normal',
      },
      {
        id: 'lunch-allergen-info',
        title: 'Confirm allergen information is visible',
        category: 'Lunch 11:00-13:00',
        priority: 'critical',
        inputType: 'yesno',
      },
    ],
  },
  {
    id: 'daytime-1300',
    shiftType: 'daytime',
    label: 'Daytime 13:00-16:00',
    tasks: [
      {
        id: 'daytime-restock-bar',
        title: 'Restock bar and coffee station',
        category: 'Daytime 13:00-16:00',
        priority: 'normal',
      },
      {
        id: 'daytime-room-reset',
        title: 'Reset meeting rooms after bookings',
        category: 'Daytime 13:00-16:00',
        priority: 'important',
        inputType: 'comment',
      },
      {
        id: 'daytime-waste-check',
        title: 'Empty visible waste if more than half full',
        category: 'Daytime 13:00-16:00',
        priority: 'normal',
      },
    ],
  },
  {
    id: 'preclosing-1500',
    shiftType: 'closing',
    label: 'Pre-closing 15:00-18:00',
    tasks: [
      {
        id: 'preclose-dish-run',
        title: 'Run dishwasher and clear back bar',
        category: 'Pre-closing 15:00-18:00',
        priority: 'normal',
      },
      {
        id: 'preclose-cash-note',
        title: 'Flag cash or POS issues for closing',
        category: 'Pre-closing 15:00-18:00',
        priority: 'important',
        inputType: 'comment',
      },
      {
        id: 'preclose-event-handoff',
        title: 'Prepare event handoff notes if applicable',
        category: 'Pre-closing 15:00-18:00',
        priority: 'normal',
        inputType: 'text',
      },
    ],
  },
  {
    id: 'closing-1800',
    shiftType: 'closing',
    label: 'Closing 18:00-19:00',
    tasks: [
      {
        id: 'close-clean-surfaces',
        title: 'Clean guest surfaces and service points',
        category: 'Closing 18:00-19:00',
        priority: 'important',
      },
      {
        id: 'close-stock-count',
        title: 'Note low stock for next day',
        category: 'Closing 18:00-19:00',
        priority: 'normal',
        inputType: 'comment',
      },
      {
        id: 'close-pos-end',
        title: 'Close POS and confirm end-of-day report',
        category: 'Closing 18:00-19:00',
        priority: 'critical',
        inputType: 'yesno',
      },
    ],
  },
  {
    id: 'security-closing',
    shiftType: 'closing',
    label: 'Security closing',
    tasks: [
      {
        id: 'security-doors',
        title: 'Check all exterior doors are locked',
        category: 'Security closing',
        priority: 'critical',
        inputType: 'yesno',
      },
      {
        id: 'security-windows',
        title: 'Check windows and terrace access',
        category: 'Security closing',
        priority: 'critical',
      },
      {
        id: 'security-alarm',
        title: 'Set alarm and record confirmation',
        category: 'Security closing',
        priority: 'critical',
        inputType: 'text',
      },
    ],
  },
  {
    id: 'event-before',
    shiftType: 'event',
    label: 'Event before',
    tasks: [
      {
        id: 'event-before-brief',
        title: 'Read event brief and contact person',
        category: 'Event before',
        priority: 'important',
      },
      {
        id: 'event-before-room',
        title: 'Set room according to event plan',
        category: 'Event before',
        priority: 'critical',
        inputType: 'comment',
      },
      {
        id: 'event-before-tech',
        title: 'Test microphone, screen and music',
        category: 'Event before',
        priority: 'critical',
        inputType: 'yesno',
      },
    ],
  },
  {
    id: 'event-during',
    shiftType: 'event',
    label: 'Event during',
    tasks: [
      {
        id: 'event-during-host',
        title: 'Welcome organizer and confirm timing',
        category: 'Event during',
        priority: 'important',
      },
      {
        id: 'event-during-refresh',
        title: 'Refresh water, coffee and service areas',
        category: 'Event during',
        priority: 'normal',
      },
      {
        id: 'event-during-issues',
        title: 'Log any guest, tech or catering issue',
        category: 'Event during',
        priority: 'important',
        inputType: 'comment',
      },
    ],
  },
  {
    id: 'event-closing-cornerbar',
    shiftType: 'event',
    label: 'Event closing Cornerbar',
    tasks: [
      {
        id: 'cornerbar-glassware',
        title: 'Collect and wash glassware',
        category: 'Event closing Cornerbar',
        priority: 'normal',
      },
      {
        id: 'cornerbar-stock',
        title: 'Restock Cornerbar fridges',
        category: 'Event closing Cornerbar',
        priority: 'important',
      },
      {
        id: 'cornerbar-secure',
        title: 'Lock Cornerbar storage',
        category: 'Event closing Cornerbar',
        priority: 'critical',
      },
    ],
  },
  {
    id: 'event-closing-atrium',
    shiftType: 'event',
    label: 'Event closing Atrium',
    tasks: [
      {
        id: 'atrium-reset',
        title: 'Reset Atrium furniture',
        category: 'Event closing Atrium',
        priority: 'important',
      },
      {
        id: 'atrium-floor',
        title: 'Sweep visible floor areas',
        category: 'Event closing Atrium',
        priority: 'normal',
      },
      {
        id: 'atrium-lights',
        title: 'Turn off Atrium lights and AV',
        category: 'Event closing Atrium',
        priority: 'critical',
        inputType: 'yesno',
      },
    ],
  },
  {
    id: 'weekly-tasks',
    shiftType: 'weekly',
    label: 'Weekly tasks',
    tasks: [
      {
        id: 'weekly-stock-count',
        title: 'Weekly beverage stock count',
        category: 'Weekly tasks',
        priority: 'important',
        recurring: { weekdays: [1] },
        inputType: 'comment',
      },
      {
        id: 'weekly-deep-clean-fridges',
        title: 'Deep clean fridges',
        category: 'Weekly tasks',
        priority: 'critical',
        recurring: { weekdays: [2] },
      },
      {
        id: 'weekly-storage-reset',
        title: 'Organize dry storage',
        category: 'Weekly tasks',
        priority: 'normal',
        recurring: { weekdays: [3] },
      },
      {
        id: 'weekly-first-aid',
        title: 'Check first aid kit and incident forms',
        category: 'Weekly tasks',
        priority: 'critical',
        recurring: { weekdays: [5] },
        inputType: 'yesno',
      },
    ],
  },
];

export const knowledgeBase = [
  {
    title: 'Guest incident notes',
    body: 'Write clear facts only: what happened, who was informed, and what follow-up is needed.',
  },
  {
    title: 'Maintenance issues',
    body: 'Take a photo, add location and urgency, then notify the manager channel before ending the shift.',
  },
  {
    title: 'Event handoff',
    body: 'Confirm organizer name, room setup, catering timing, AV needs and any unpaid extras.',
  },
  {
    title: 'Security reminder',
    body: 'The last person out checks doors, windows, storage, alarm and the guest toilets.',
  },
];
