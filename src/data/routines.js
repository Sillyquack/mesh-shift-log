export const staffCodes = [
  { code: '1001', name: 'Bobby', role: 'manager', isManager: true },
  { code: '1002', name: 'Ivana', role: 'staff', isManager: false },
  { code: '1003', name: 'Vlad', role: 'staff', isManager: false },
  { code: '1004', name: 'Rebekka', role: 'staff', isManager: false },
  { code: '1005', name: 'Mircea', role: 'staff', isManager: false },
  { code: 'OPEN', name: 'Time2Staff Opening', role: 'opening team', isManager: false, needsName: true },
  { code: 'CLOSE', name: 'Time2Staff Closing', role: 'closing team', isManager: false, needsName: true },
  { code: 'EVENT', name: 'Time2Staff Event Responsible', role: 'event responsible', isManager: false, needsName: true },
];

export const shiftOptions = [
  { id: 'opening', label: 'Opening shift' },
  { id: 'daytime', label: 'Daytime shift' },
  { id: 'closing', label: 'Closing shift' },
  { id: 'event', label: 'Event shift' },
  { id: 'weekly', label: 'Weekly tasks' },
  { id: 'guides', label: 'Guides / Knowledge base' },
];

export const areas = [
  'workbar',
  'atrium',
  'cornerbar',
  'kitchen',
  'lounge',
  'project_rooms',
  'toilets',
  'entrance',
  'pos',
  'salto',
  'security',
  'event',
  'general',
];

const defaults = {
  description: '',
  area: 'general',
  priority: 'normal',
  requiresComment: false,
  inputType: 'none',
  recurring: { type: 'daily' },
  criticalConfirm: false,
  managerOnly: false,
  active: true,
};

function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function createTask(shiftType, section, timeBlock, title, overrides = {}) {
  return {
    ...defaults,
    id: overrides.id || `${shiftType}-${slug(section)}-${slug(title)}`,
    title,
    shiftType,
    section,
    timeBlock,
    ...overrides,
  };
}

function section(id, shiftType, label, taskTitles, sectionDefaults = {}) {
  return {
    id,
    shiftType,
    label,
    timeBlock: label,
    tasks: taskTitles.map((entry) => {
      const [title, overrides = {}] = Array.isArray(entry) ? entry : [entry, {}];
      return createTask(shiftType, label, label, title, { ...sectionDefaults, ...overrides });
    }),
  };
}

export function normalizeRoutineTask(task, sectionData = {}) {
  const shiftType = task.shiftType || sectionData.shiftType || 'opening';
  const sectionName = task.section || task.category || sectionData.label || 'General';
  const timeBlock = task.timeBlock || sectionData.timeBlock || sectionName;
  return {
    ...defaults,
    ...task,
    id: task.id || `${shiftType}-${slug(sectionName)}-${slug(task.title || 'task')}`,
    title: task.title || 'Untitled task',
    description: task.description || '',
    shiftType,
    section: sectionName,
    timeBlock,
    category: sectionName,
    area: areas.includes(task.area) ? task.area : defaults.area,
    priority: ['normal', 'important', 'critical'].includes(task.priority) ? task.priority : defaults.priority,
    inputType: task.inputType && task.inputType !== 'comment' ? task.inputType : task.inputType || defaults.inputType,
    recurring: task.recurring || defaults.recurring,
    requiresComment: Boolean(task.requiresComment),
    criticalConfirm: Boolean(task.criticalConfirm),
    managerOnly: Boolean(task.managerOnly),
    active: task.active !== false,
  };
}

export function normalizeRoutines(routines) {
  if (!Array.isArray(routines)) return defaultRoutines;
  return routines.map((routine) => ({
    ...routine,
    timeBlock: routine.timeBlock || routine.label,
    tasks: Array.isArray(routine.tasks)
      ? routine.tasks.map((task) => normalizeRoutineTask(task, routine))
      : [],
  }));
}

export const defaultRoutines = [
  section('opening-0700', 'opening', 'Opening 07:00-08:00', [
    ['Check event calendar and table bookings', { area: 'event', priority: 'important' }],
    ['Brew coffee and check meeting room coffee orders', { area: 'kitchen', priority: 'important' }],
    ['Turn on espresso machine', { area: 'workbar', priority: 'important' }],
    ['Place coffee in members lounge and remove used cups', { area: 'lounge' }],
    ['Refill milk and oat milk in coffee machine', { area: 'workbar', priority: 'important' }],
    ['Refill Workbar milk fridge', { area: 'workbar' }],
    ['Open POS/register and count cash drawer', { description: 'Expected cash drawer: 1000 NOK.', area: 'pos', priority: 'critical', inputType: 'number', criticalConfirm: true }],
    ['Turn on music and check Q-SYS/Soundtrack', { area: 'general', priority: 'important' }],
    ['Turn on Workbar dishwasher', { area: 'workbar' }],
    ['Check cleaning station', { area: 'general' }],
    ['Turn on kitchen dishwashers', { area: 'kitchen' }],
    ['Check project rooms, cups and glasses match chair count', { area: 'project_rooms', priority: 'important' }],
    ['Put out baked goods', { area: 'workbar' }],
    ['Stock food/drink fridge', { area: 'workbar' }],
    ['Refill self-service station', { area: 'workbar' }],
    ['Check entrance area', { area: 'entrance' }],
    ['Open member/front doors in Salto if needed', { area: 'salto', priority: 'important', inputType: 'comment' }],
    ['Adjust lights to lunch', { area: 'general' }],
    ['Light candles during winter', { area: 'general', inputType: 'comment' }],
    ['Turn on Workbar screens', { area: 'workbar' }],
    ['Put out sign', { area: 'entrance' }],
    ['Check nothing is marked sold out in POS', { area: 'pos', priority: 'critical', criticalConfirm: true }],
    ["Update today's lunch in POS", { area: 'pos', priority: 'important' }],
  ]),
  section('opening-0800', 'opening', 'Opening 08:00-10:00', [
    ['Recheck calendar for new bookings', { area: 'event', priority: 'important' }],
    ['Change dirty cups/glasses from lounge', { area: 'lounge' }],
    ['Open lounge meeting room doors', { area: 'lounge' }],
    ['Refill drink fridge, check dates, FIFO', { area: 'workbar', priority: 'important' }],
    ['Refill cutlery, napkins, glasses, cups, plates, salt and pepper', { area: 'workbar' }],
    ['Refill takeaway cups and lids', { area: 'workbar' }],
    ['Check venues and furniture placement', { area: 'event', priority: 'important' }],
    ['Make sure enough coffee is ready for lunch rush', { area: 'kitchen', priority: 'important' }],
    ['Check Community Stage calendar for tomorrow and update Airtame if needed', { area: 'event', inputType: 'comment' }],
  ]),
  section('opening-1000', 'opening', 'Opening 10:00-11:00', [
    ['Check bookings and event calendar for lunch reservations', { area: 'event', priority: 'important' }],
    ['Check toilets: paper, soap and tidiness', { area: 'toilets', priority: 'important' }],
    ['Clean/reset project rooms after use', { area: 'project_rooms' }],
  ]),
  section('lunch-1100', 'daytime', 'Lunch 11:00-13:00', [
    ['Keep cleaning station clear', { area: 'general' }],
    ['Wash Workbar tables', { area: 'workbar' }],
    ['Keep bar clean and tidy', { area: 'workbar' }],
    ['Refill water glasses, coffee cups and cutlery', { area: 'workbar' }],
    ['Watch guest flow and clear tables continuously', { area: 'atrium', priority: 'important' }],
  ]),
  section('daytime-1300', 'daytime', 'Daytime 13:00-16:00', [
    ['Check Workbar toilets', { area: 'toilets', priority: 'important' }],
    ['Wash dirty cafe dishes and remove kitchen garbage', { area: 'kitchen' }],
    ['Slack member deliveries and place them in mail room', { area: 'general', inputType: 'comment' }],
    ['Refill sugar, tea, teaspoons, coffee, napkins, takeaway cups and lids', { area: 'workbar' }],
    ['Clean/reset meeting rooms', { area: 'project_rooms' }],
    ['Clean self-service area', { area: 'workbar' }],
    ['Check venues and entrance area', { area: 'entrance' }],
    ['Carry out garbage', { area: 'general' }],
    ['Change lights to Evening between 15:00 and 16:00', { area: 'general', priority: 'important' }],
    ['Turn music slightly up for afterwork vibe Wednesday-Friday', { area: 'general', recurring: { type: 'weekdays', days: ['wednesday', 'thursday', 'friday'] } }],
    ['Change candles', { area: 'general' }],
  ]),
  section('preclosing-1500', 'closing', 'Pre-closing 15:00-18:00', [
    ['Check calendars and get overview', { area: 'event', priority: 'important' }],
    ['Clean all tables in Workbar, Atrium and Worklounge', { area: 'atrium' }],
    ['Rinse used coffee jugs', { area: 'kitchen' }],
    ['Clean coffee station in kitchen', { area: 'kitchen' }],
    ['Clean meeting rooms and prepare cups/glasses for next day', { area: 'project_rooms', priority: 'important' }],
    ['Restock Workbar and bar fridges with soda, beer, prosecco and wine', { area: 'workbar', priority: 'important' }],
    ['Check dates and use FIFO when restocking', { area: 'workbar', priority: 'important' }],
    ['Write dates on opened wine/prosecco bottles', { area: 'workbar', priority: 'important' }],
    ['Too Good To Go: register/svinn leftover food', { area: 'kitchen', priority: 'important', inputType: 'comment' }],
    ['Clean cleaning station', { area: 'general' }],
  ]),
  section('closing-1800', 'closing', 'After closing 18:00-19:00', [
    ['Put leftover food and pastry in SVINN', { area: 'kitchen', priority: 'important' }],
    ['Bring in sign', { area: 'entrance' }],
    ['Run coffee machine cleaning mode', { area: 'workbar', priority: 'important' }],
    ['Clean milk tank, fridge and loose parts on Wednesday and Friday', { area: 'workbar', priority: 'important', recurring: { type: 'weekdays', days: ['wednesday', 'friday'] } }],
    ['Clean used bar equipment and put it back', { area: 'workbar' }],
    ['Wipe beer taps and wash silver parts', { area: 'workbar' }],
    ['Clean drip trays under beer taps', { area: 'workbar' }],
    ['Clean self-service surfaces, lift trays and clean underneath', { area: 'workbar' }],
    ['Clean bar counter and behind the bar', { area: 'workbar' }],
    ['Clean all tables in Workbar, Atrium and Worklounge', { area: 'atrium' }],
    ['Make Workbar, Atrium and Worklounge look clean and ready', { area: 'atrium', priority: 'important' }],
    ['Empty Workbar dishwasher, rinse filters and turn off', { area: 'workbar' }],
    ['Check kitchen for garbage/dishes and handle it', { area: 'kitchen' }],
    ['Check kitchen floor, nothing left on floor', { area: 'kitchen' }],
    ['Empty kitchen dishwashers, rinse filters and turn off', { area: 'kitchen' }],
    ['Take dirty rags to cleaning storage', { area: 'general' }],
    ['Take out all trash from Workbar, cleaning station and kitchen', { area: 'general', priority: 'important' }],
    ['Take PANT and GLASS to garbage room and rinse bins afterwards', { area: 'general', priority: 'important' }],
    ['Turn off Workbar lights correctly', { area: 'workbar', priority: 'important' }],
    ['Turn off music in Q-SYS, Atrium and Cornerbar', { area: 'general', priority: 'important' }],
    ['Make sure all iPads and POS are charging', { area: 'pos', priority: 'important' }],
    ['Check all POS tables are closed', { area: 'pos', priority: 'critical', criticalConfirm: true }],
    ['Close register and send report', { area: 'pos', priority: 'critical', criticalConfirm: true }],
    ['Close fridges', { area: 'workbar', priority: 'important' }],
    ['Put till and keys in safe', { area: 'security', priority: 'critical', criticalConfirm: true }],
  ]),
  section('security-closing', 'closing', 'Critical final checks', [
    ['Check Workbar, Basement and Cornerbar toilets for remaining guests', { area: 'security', priority: 'critical', criticalConfirm: true }],
    ['Make sure front door and vindfang door are locked', { area: 'security', priority: 'critical', criticalConfirm: true }],
    ['Make sure Kitchen/Atrium, Atrium/Workbar, Cornerbar/Atrium and garbage hallway/Atrium doors are closed and locked', { area: 'security', priority: 'critical', criticalConfirm: true }],
    ['Check Salto after events/manual overrides', { area: 'salto', priority: 'critical', criticalConfirm: true, inputType: 'yesno' }],
    ['Set alarm before leaving', { area: 'security', priority: 'critical', criticalConfirm: true }],
    ['Manually lock Cornerbar street door upper lock', { area: 'cornerbar', priority: 'critical', criticalConfirm: true }],
  ]),
  section('responsible-closing-control', 'closing', 'Responsible closing control', [
    ['Confirm cash/register settlement is completed', { area: 'pos', priority: 'critical', criticalConfirm: true }],
    ['Confirm Workbar iPads, terminals and POS are charging/in place', { area: 'pos', priority: 'important' }],
    ['Confirm Cornerbar iPads, terminals and POS are charging/in place if used', { area: 'cornerbar', priority: 'important', inputType: 'comment' }],
    ['Confirm tills and keys are in the safe', { area: 'security', priority: 'critical', criticalConfirm: true }],
    ['Confirm Workbar has been checked after guests left', { area: 'workbar', priority: 'important' }],
    ['Confirm Cornerbar has been checked after guests left', { area: 'cornerbar', priority: 'important' }],
    ['Confirm all relevant doors are locked', { area: 'security', priority: 'critical', criticalConfirm: true }],
    ['Confirm Salto/door overrides are checked', { area: 'salto', priority: 'critical', criticalConfirm: true }],
    ['Confirm alarm is set before leaving', { area: 'security', priority: 'critical', criticalConfirm: true }],
    ['Confirm final handover note is written', { area: 'general', priority: 'important', requiresComment: true }],
  ]),
  section('event-before', 'event', 'Event before', [
    ['Check Google Calendar for Atrium, Bar, Workbar and project rooms', { area: 'event', priority: 'important' }],
    ['Clock in and be ready before shift starts', { area: 'general', priority: 'important' }],
    ['Check kitchen about food orders, serving time and allergies', { area: 'kitchen', priority: 'critical', criticalConfirm: true }],
    ['Check technical equipment and microphone batteries', { area: 'event', priority: 'critical', criticalConfirm: true }],
    ['Check entrance and sidewalk', { area: 'entrance' }],
    ['Check smell and temperature', { area: 'event' }],
    ['Turn on lights and set warm white/amber', { area: 'event' }],
    ['Rig according to execution plan', { area: 'event', priority: 'important' }],
    ['Check toilets and refill paper/soap', { area: 'toilets', priority: 'important' }],
    ['Put on event music', { area: 'event' }],
  ]),
  section('event-client-arrival', 'event', 'Client arrival', [
    ['Meet client, introduce yourself and give phone number', { area: 'event', priority: 'important' }],
    ['Confirm execution plan with client', { area: 'event', priority: 'critical', criticalConfirm: true }],
    ['Confirm breaks, serving times and bar tab', { area: 'event', priority: 'critical', criticalConfirm: true }],
    ['Show technical equipment if no technician', { area: 'event', priority: 'important' }],
    ['Introduce client to team/technician', { area: 'event' }],
    ['Put out event signs', { area: 'entrance' }],
    ['Prepare coffee station if needed', { area: 'event', inputType: 'comment' }],
    ['Prepare food station if needed', { area: 'event', inputType: 'comment' }],
    ['Prepare bar if needed', { area: 'workbar', inputType: 'comment' }],
    ['Use open wine bottles first', { area: 'workbar' }],
    ['Ask client if Cornerbar door should be open, then open in Salto if needed', { area: 'salto', priority: 'important', inputType: 'comment' }],
    ['Put garbage bins in venue', { area: 'event' }],
    ['Light candles during winter', { area: 'event', inputType: 'comment' }],
  ]),
  section('event-during', 'event', 'Event during', [
    ['Welcome guests and direct them to venue', { area: 'event' }],
    ['Be present during breaks', { area: 'event', priority: 'important' }],
    ['Replace used cups/glasses', { area: 'event' }],
    ['Clean tables and refill coffee/food station', { area: 'event' }],
    ['Check toilets including Workbar toilets', { area: 'toilets', priority: 'important' }],
    ['Air room during breaks if long event', { area: 'event' }],
    ['Keep coffee/drinks ready for refill', { area: 'event' }],
    ['Check upcoming events and prepare if possible', { area: 'event' }],
    ['Do weekly event routines when quiet', { area: 'event' }],
    ['Keep dishwashing area clean', { area: 'kitchen' }],
    ['Handle Kanon catering dishes separately', { area: 'kitchen', priority: 'important' }],
    ['Take breaks only during quiet time, one person at a time', { area: 'general' }],
    ['Punch in all drinks: coffee, soda and bar sales', { area: 'pos', priority: 'critical', criticalConfirm: true }],
    ['Punch in event staff food separately if needed', { area: 'pos', priority: 'important', inputType: 'comment' }],
    ['Print receipt and Slack photo to hospitality billing', { area: 'pos', priority: 'critical', criticalConfirm: true }],
  ]),
  section('event-closing-cornerbar', 'event', 'Event closing Cornerbar', [
    ['Ask client if they were happy and say goodbye', { area: 'event', inputType: 'comment' }],
    ['Make sure everything is correctly punched', { area: 'pos', priority: 'critical', criticalConfirm: true }],
    ['Print temporary receipt for client signature if tab was used', { area: 'pos', priority: 'important', inputType: 'comment' }],
    ['Close register and send report', { area: 'pos', priority: 'critical', criticalConfirm: true }],
    ['Make sure all guests have left', { area: 'security', priority: 'critical', criticalConfirm: true }],
    ['Clean all bar surfaces', { area: 'cornerbar' }],
    ['Clean all tables', { area: 'cornerbar' }],
    ['Remove candles and candle holders', { area: 'cornerbar' }],
    ['Date all open wine/prosecco bottles', { area: 'cornerbar', priority: 'important' }],
    ['Refill fridges', { area: 'cornerbar' }],
    ['Clean glasses, including checking toilets for glass after big parties', { area: 'toilets', priority: 'important' }],
    ['Clean used bar equipment', { area: 'cornerbar' }],
    ['Take out trash, glass, pant and cardboard, rinse buckets', { area: 'cornerbar', priority: 'important' }],
    ['Turn off microphones and charge batteries', { area: 'event', priority: 'critical', criticalConfirm: true }],
    ['Turn off dishwashers', { area: 'kitchen' }],
    ['Turn off coffee machine', { area: 'workbar' }],
    ['Lock street door and make sure Atrium door is closed', { area: 'security', priority: 'critical', criticalConfirm: true }],
    ['Remove signs', { area: 'entrance' }],
    ['Ensure venue looks ready for viewing next day', { area: 'event', priority: 'important' }],
  ]),
  section('event-closing-atrium', 'event', 'Event closing Atrium', [
    ['Ask client if they were happy and say goodbye', { area: 'event', inputType: 'comment' }],
    ['Make sure everything is correctly punched', { area: 'pos', priority: 'critical', criticalConfirm: true }],
    ['Make sure all guests have left', { area: 'security', priority: 'critical', criticalConfirm: true }],
    ['Wash cups, glasses, cutlery and plates', { area: 'kitchen' }],
    ['Put everything back where it belongs', { area: 'atrium' }],
    ['Clean water/coffee station under kitchen window', { area: 'atrium' }],
    ['Clean all tables', { area: 'atrium' }],
    ['Check next event plan and rig if possible', { area: 'event', inputType: 'comment' }],
    ['Turn off microphones and charge batteries', { area: 'event', priority: 'critical', criticalConfirm: true }],
    ['Take out trash and rinse buckets', { area: 'atrium', priority: 'important' }],
    ['Clean kitchen surfaces, dishwasher and floor', { area: 'kitchen' }],
    ['Turn off lights', { area: 'atrium' }],
    ['Ensure venue looks ready for viewing next day', { area: 'event', priority: 'important' }],
  ]),
  section('weekly-tasks', 'weekly', 'Weekly tasks', [
    ['Monday: Walk building floors and collect bar/cafe items', { recurring: { type: 'weekdays', days: ['monday'] }, area: 'general' }],
    ['Wednesday: Walk building floors and collect bar/cafe items', { recurring: { type: 'weekdays', days: ['wednesday'] }, area: 'general' }],
    ['Wednesday: Deep clean coffee machine milk system', { recurring: { type: 'weekdays', days: ['wednesday'] }, area: 'workbar', priority: 'important' }],
    ['Friday: Deep clean coffee machine milk system', { recurring: { type: 'weekdays', days: ['friday'] }, area: 'workbar', priority: 'important' }],
    ['Friday: Check fridges and dates before weekend', { recurring: { type: 'weekdays', days: ['friday'] }, area: 'workbar', priority: 'important' }],
    ['Weekly: Check low-stock items', { area: 'general', priority: 'important', inputType: 'comment' }],
    ['Weekly: Check cleaning agents', { area: 'general' }],
    ['Weekly: Check batteries and technical basics', { area: 'event', priority: 'important' }],
    ['Weekly: Check fridge layout against standard', { area: 'workbar', priority: 'important' }],
  ]),
];

export const knowledgeBase = [
  {
    title: 'How to use this app',
    body: 'Enter your code, choose your shift, complete tasks, add comments when needed, add handover notes, and ask the manager to export backups.',
  },
  {
    title: 'POS/register basics',
    body: 'Count cash carefully, close POS tables before closing, and only confirm critical POS tasks after checking the register.',
  },
  {
    title: 'Salto/security reminders',
    body: 'Use Salto checks when doors have manual overrides, and physically check doors before confirming security tasks.',
  },
  {
    title: 'Handover notes',
    body: 'Add low stock, maintenance issues, member notes and event details before leaving the shift.',
  },
  {
    title: 'Backup/export',
    body: 'Data is local to this browser. Managers should export JSON backups regularly from the dashboard.',
  },
  {
    title: 'Time2Staff login',
    body: 'Use OPEN, CLOSE or EVENT, then enter your real first name. This name is saved with completed tasks.',
  },
  {
    title: 'Critical tasks',
    body: 'Critical tasks must be physically checked before you confirm them. Do not mark them Done from memory.',
  },
  {
    title: 'Guest incident notes',
    body: 'Write clear facts only: what happened, who was informed, and what follow-up is needed.',
  },
  {
    title: 'Security reminder',
    body: 'The last person out checks doors, windows, storage, alarm and the guest toilets.',
  },
];
