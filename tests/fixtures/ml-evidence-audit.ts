import type { SectionKey } from '../../src/resume.ts';

export type EvidenceAuditStatus = 'supported' | 'partial' | 'absent';

export interface EvidenceAuditComponent {
  id: string;
  text: string;
  sourceIds: readonly string[];
}

export interface EvidenceAuditPassage {
  id: string;
  text: string;
  section: SectionKey;
}

export interface EvidenceAuditCase {
  id: string;
  requirement: string;
  expected: EvidenceAuditStatus;
  components: readonly EvidenceAuditComponent[];
  passages: readonly EvidenceAuditPassage[];
}

function passage(id: string, text: string, section: SectionKey = 'experience'): EvidenceAuditPassage {
  return { id, text, section };
}

// Independent synthetic cases. An empty sourceIds list means the resume contains no supporting passage for that component.
export const evidenceAuditCases: readonly EvidenceAuditCase[] = [
  {
    id: 'released-device-software',
    requirement: 'Write test plans and lead pre-release validation for medical device software.',
    expected: 'supported',
    components: [
      { id: 'plans', text: 'Write test plans for medical device software.', sourceIds: ['plans'] },
      { id: 'validation', text: 'Lead pre-release validation for medical device software.', sourceIds: ['runs'] },
    ],
    passages: [
      passage('release-notes', 'Prepared customer-facing notes for new device firmware versions and published them in the help center.'),
      passage('runs', 'Directed validation sessions for patient-monitor firmware before each release and assigned verification runs to the test team.'),
      passage('training', 'Attended a workshop on validation planning for regulated medical products.', 'education'),
      passage('plans', 'Authored the test strategy, acceptance criteria, and verification scenarios for patient-monitor firmware updates.'),
      passage('support', 'Investigated help desk tickets on monitoring devices and documented repeat installation issues.'),
    ],
  },
  {
    id: 'delegated-refund-approval',
    requirement: 'Process and approve refunds for enterprise accounts.',
    expected: 'partial',
    components: [
      { id: 'processing', text: 'Process refunds for enterprise accounts.', sourceIds: ['enterprise-processing'] },
      { id: 'approval', text: 'Approve refunds for enterprise accounts.', sourceIds: [] },
    ],
    passages: [
      passage('retail-approval', 'Approved refunds at the retail service desk for individual customers after checking receipts.'),
      passage('enterprise-processing', 'Processed enterprise customer refunds in the billing system after the finance controller granted approval.'),
      passage('routing', 'Sent enterprise refund requests to the financial controller with invoice records and reason codes for approval.'),
      passage('billing', 'Reconciled enterprise subscription invoices against signed order forms at month end.'),
      passage('training', 'Created a reference guide on how account managers can submit enterprise refund requests.'),
    ],
  },
  {
    id: 'warehouse-training-audience',
    requirement: 'Design safety training materials and deliver sessions to new warehouse associates.',
    expected: 'partial',
    components: [
      { id: 'design', text: 'Design safety training materials for new warehouse associates.', sourceIds: ['curriculum'] },
      { id: 'delivery', text: 'Deliver safety training sessions to new warehouse associates.', sourceIds: [] },
    ],
    passages: [
      passage('trainer-prep', 'Briefed shift supervisors on the warehouse induction material so they could teach it to incoming associates.'),
      passage('office-sessions', 'Delivered safety sessions on workstation ergonomics to office staff using a handbook written by the facilities team.'),
      passage('curriculum', 'Wrote induction handouts and practical exercises on safe lifting and pallet handling for incoming warehouse associates.'),
      passage('room-booking', 'Scheduled rooms and tracked attendance for warehouse safety classes led by the operations trainer.'),
      passage('dispatch', 'Updated cross-dock shipment records at shift handover and flagged unassigned pallets.'),
    ],
  },
  {
    id: 'payment-fraud-triage',
    requirement: 'Screen suspected payment fraud referrals and communicate investigation findings to case owners.',
    expected: 'supported',
    components: [
      { id: 'screening', text: 'Screen referrals for suspected payment fraud.', sourceIds: ['intake'] },
      { id: 'findings', text: 'Communicate the findings of suspected payment fraud investigations to case owners.', sourceIds: ['updates'] },
    ],
    passages: [
      passage('queue', 'Produced queue volume charts for the monthly payments risk review.'),
      passage('updates', 'Sent the investigators responsible for each case summaries of confirmed patterns and open issues from fraud reviews of disputed payments.'),
      passage('organization', 'Maintained the fraud team’s escalation directory and arranged coverage during analyst absences.'),
      passage('intake', 'Reviewed flagged card activity at intake and prioritized suspicious transactions for further investigation.'),
      passage('accounts', 'Answered account holders’ questions about scheduled payments and statements.'),
    ],
  },
  {
    id: 'support-platform-alternatives',
    requirement: 'Use Zendesk or Freshdesk to maintain customer profiles and document support ticket histories.',
    expected: 'supported',
    components: [
      { id: 'profiles', text: 'Maintain customer profiles in Zendesk or Freshdesk.', sourceIds: ['profiles'] },
      { id: 'ticket-history', text: 'Document support ticket histories in Zendesk or Freshdesk.', sourceIds: ['case-notes'] },
    ],
    passages: [
      passage('dashboard', 'Read Zendesk dashboard summaries during team meetings and shared the backlog counts with department leads.'),
      passage('profiles', 'Kept client names, contact information, and account details current in Freshdesk during service interactions.'),
      passage('crm', 'Updated sales contacts and company mailing preferences in HubSpot.'),
      passage('case-notes', 'Recorded each service case’s timeline, attempted resolution, and follow-up in Freshdesk.'),
      passage('staffing', 'Maintained weekly staffing rosters for the billing support team.'),
    ],
  },
  {
    id: 'mobile-ci-scope',
    requirement: 'Design and operate continuous integration pipelines for iOS applications.',
    expected: 'absent',
    components: [
      { id: 'design', text: 'Design continuous integration pipelines for iOS applications.', sourceIds: [] },
      { id: 'operation', text: 'Operate continuous integration pipelines for iOS applications.', sourceIds: [] },
    ],
    passages: [
      passage('web-pipeline', 'Designed and operated continuous integration pipelines for a browser-based reporting portal.'),
      passage('ios-tests', 'Added unit tests to an iOS application and reviewed build reports generated by the release engineering team.'),
      passage('android-build', 'Maintained Android build workflows and updated Gradle dependency checks for the mobile team.'),
      passage('copy', 'Documented the iOS pipeline ownership handoff and escalated build failures to its operators.'),
      passage('routine', 'Managed sprint intake and published the team’s change summary each Friday.'),
    ],
  },
  {
    id: 'grant-budget-and-submission',
    requirement: 'Draft grant budgets and submit final proposals to funders.',
    expected: 'supported',
    components: [
      { id: 'budgeting', text: 'Draft grant budgets.', sourceIds: ['proposal-lead'] },
      { id: 'submission', text: 'Submit final grant proposals to funders.', sourceIds: ['proposal-lead'] },
    ],
    passages: [
      passage('audit', 'Reconciled spending for existing awards and assembled receipts for the grant accountant.'),
      passage('review', 'Proofread the narrative sections of grant applications and returned suggestions to the proposal leads.'),
      passage('proposal-lead', 'Built cost breakdowns for foundation grant applications and uploaded the final funding packages through each funder’s portal.'),
      passage('calendar', 'Tracked grant deadlines and reminded project leads to confirm they had submitted their proposals.'),
      passage('news', 'Prepared a newsletter about community programs supported by foundation awards.'),
    ],
  },
  {
    id: 'overnight-workforce-alternative',
    requirement: 'Create weekly staffing forecasts or lead shift allocation for overnight distribution operations.',
    expected: 'supported',
    components: [
      {
        id: 'workforce-planning',
        text: 'Create weekly staffing forecasts or lead shift allocation for overnight distribution operations.',
        sourceIds: ['overnight-allocation'],
      },
    ],
    passages: [
      passage('day-shift', 'Generated headcount forecasts for the daytime call center and sent recommendations to workforce managers.'),
      passage('overnight-allocation', 'Led assignment of workers to pick, pack, and dock stations on the third shift at a fulfillment center.'),
      passage('arrival', 'Printed incoming trailer lists and checked driver arrival logs before the night shift began.'),
      passage('time-clock', 'Corrected missed clock punches for distribution employees and notified supervisors when records changed.'),
      passage('seasonal', 'Logged seasonal overtime requests and routed them to the shift manager for decisions.'),
    ],
  },
  {
    id: 'monthly-inventory-adjustments',
    requirement: 'Run monthly inventory audits and authorize inventory adjustments at distribution centers.',
    expected: 'partial',
    components: [
      { id: 'audits', text: 'Run monthly inventory audits at distribution centers.', sourceIds: ['monthly-counts'] },
      { id: 'adjustments', text: 'Authorize inventory adjustments at distribution centers.', sourceIds: [] },
    ],
    passages: [
      passage('authorizing-returns', 'Approved store merchandise returns as floor supervisor and updated the returns register.'),
      passage('monthly-counts', 'Led month-end physical stock audits at two distribution sites and reconciled counts to warehouse records.'),
      passage('adjustment-entries', 'Prepared distribution center adjustment entries and sent them to the inventory controller for authorization.'),
      passage('storage', 'Rearranged storage bays for oversized cartons and posted updated rack labels.'),
      passage('capacity', 'Summarized daily warehouse throughput and flagged capacity issues for dispatch leads.'),
    ],
  },
  {
    id: 'production-kafka-admin',
    requirement: 'Operate production Apache Kafka connectors and administer access policies for those clusters.',
    expected: 'absent',
    components: [
      { id: 'connectors', text: 'Operate production Apache Kafka connectors.', sourceIds: [] },
      { id: 'cluster-access', text: 'Administer access policies for production Apache Kafka clusters.', sourceIds: [] },
    ],
    passages: [
      passage('rabbitmq', 'Operated production RabbitMQ connectors and maintained application permissions on those brokers.'),
      passage('lab', 'Configured Kafka Connect plugins and topic permissions in a local training cluster.', 'projects'),
      passage('handoff', 'Reported production Kafka connector errors to the platform operators and tracked their remediation in the incident system.'),
      passage('governance', 'Collected access review evidence and scheduled quarterly sign-off for production Kafka permissions managed by the platform security team.'),
      passage('reports', 'Subscribed to event topics to update service-usage dashboards for account managers.'),
    ],
  },
];
