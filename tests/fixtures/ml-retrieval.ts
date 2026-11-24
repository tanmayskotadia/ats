import type { SectionKey } from '../../src/resume.ts';

export interface RetrievalPassage {
  text: string;
  section: SectionKey;
  relevance: 0 | 1;
}

export interface RetrievalCase {
  id: string;
  query: string;
  passages: readonly RetrievalPassage[];
}

function passage(text: string, relevance: RetrievalPassage['relevance'], section: SectionKey = 'experience'): RetrievalPassage {
  return { text, section, relevance };
}

// Synthetic resume passages with hand-assigned labels for each requirement.
// Relevant passages describe work or credentials that directly support the requirement.
export const retrievalCases: readonly RetrievalCase[] = [
  {
    id: 'warehouse-demand-forecasting',
    query: 'Build statistical models to forecast warehouse inventory demand.',
    passages: [
      passage('Maintained a warehouse inventory dashboard that tracked stock on hand, aged units, and daily dispatch volumes.', 0),
      passage('Fit seasonal regressions to historical orders and holiday effects to estimate weekly replenishment quantities for three distribution centers.', 1),
      passage('Analyzed historical warehouse inventory demand and passed the findings to the team responsible for forecasting.', 0),
      passage('Built time-series regressions to forecast call-center staffing needs by day and shift.', 0),
      passage('Trained gradient-boosted trees to estimate future SKU-level unit sales and set reorder thresholds at two fulfillment sites.', 1, 'projects'),
      passage('Reconciled physical cycle counts against warehouse management records at the end of each month.', 0),
      passage('Presented forecast variances supplied by the planning team at monthly warehouse operations reviews.', 0),
    ],
  },
  {
    id: 'production-eks',
    query: 'Deploy and operate production Kubernetes clusters on Amazon EKS.',
    passages: [
      passage('Ran rolling upgrades and capacity changes for customer applications on Google Kubernetes Engine.', 0),
      passage('Updated Amazon EKS runbooks and routed incidents to the platform engineers who operated the clusters.', 0),
      passage('Provisioned production ECS services and managed autoscaling policies for AWS Fargate workloads.', 0),
      passage('Provisioned Amazon Elastic Kubernetes Service clusters serving live customer traffic and handled node upgrades, cluster alerts, and rollbacks.', 1),
      passage('Tested Helm charts in a local kind cluster and submitted deployment changes to the release team.', 0, 'projects'),
      passage('Migrated container images to Amazon ECR and set image lifecycle and vulnerability scanning policies.', 0),
      passage('Ran an EKS proof of concept for a one-week training environment using sample services.', 0, 'projects'),
    ],
  },
  {
    id: 'nursing-shift-handoff',
    query: 'Conduct bedside patient handoffs during nursing shift changes.',
    passages: [
      passage('Gave in-room change-of-shift reports to incoming nurses, reviewing active orders and the next steps in each patient’s care.', 1),
      passage('Scheduled nursing shift coverage and updated the bedside handoff roster before each evening transition.', 0),
      passage('Entered patient observations into the chart for the attending nurse to use in the shift handoff.', 0),
      passage('Coordinated transport handovers with porters when patients moved between hospital buildings.', 0),
      passage('Reviewed patient status, outstanding medications, and care priorities with the nurse taking over at each bedside.', 1),
      passage('Audited bedside supplies and restocked patient rooms before the morning nursing shift.', 0),
      passage('Led phone updates about discharge times with patient families and outpatient clinics.', 0),
    ],
  },
  {
    id: 'bank-reconciliation',
    query: 'Perform monthly bank reconciliations and investigate differences against the general ledger.',
    passages: [
      passage('Prepared the monthly bank statement package for the controller and recorded the dates reconciliations were completed.', 0),
      passage('Reconciled the accounts payable subledger to the general ledger at each month-end close.', 0),
      passage('Logged unreconciled bank transactions raised by the treasury team and tracked their assigned owners.', 0),
      passage('Prepared monthly cash-flow forecasts from projected disbursements and expected collections.', 0),
      passage('Verified that employee expense reports included appropriate receipts and department approvals.', 0),
      passage('Matched statement entries to cash accounts at each close and traced unmatched payments to outstanding deposits and posting errors.', 1),
      passage('Reviewed quarterly cash balances from a consolidated report and escalated outliers to the controller.', 0),
    ],
  },
  {
    id: 'active-pmp',
    query: 'Current Project Management Professional (PMP) certification is required.',
    passages: [
      passage('Completed a Project Management Professional exam preparation course and scheduled the PMP exam.', 0, 'education'),
      passage('Certified Associate in Project Management (CAPM), Project Management Institute, active.', 0, 'certifications'),
      passage('Project Management Professional, awarded by PMI. Credential renewed and currently active.', 1, 'certifications'),
      passage('Previously held Project Management Professional (PMP) certification. Credential expired in 2022.', 0, 'certifications'),
      passage('Managed a cross-functional systems migration against planned scope, schedule, and budget.', 0),
      passage('PRINCE2 Practitioner certification, current.', 0, 'certifications'),
      passage('Verified current PMP certificates for external project managers as part of vendor onboarding.', 0),
    ],
  },
  {
    id: 'manual-accessibility-testing',
    query: 'Manually test web interfaces with both keyboard navigation and a screen reader.',
    passages: [
      passage('Audited WCAG issues with axe and filed tickets for invalid ARIA attributes and low color contrast.', 0),
      passage('Verified keyboard navigation by checking focus order and arrow-key support across forms and modal dialogs.', 0),
      passage('Reviewed customer feedback about screen-reader compatibility and assigned reports to the QA team.', 0),
      passage('Validated responsive layouts with Playwright across mobile and desktop viewports.', 0, 'projects'),
      passage('Used NVDA to check announced labels and state changes, and completed checkout using keys alone to verify focus and controls.', 1),
      passage('Wrote onboarding instructions for enabling VoiceOver and remapping browser keyboard shortcuts.', 0),
      passage('Walked through new account flows using Tab and arrow keys and listened to VoiceOver to verify each field was announced.', 1, 'projects'),
    ],
  },
  {
    id: 'commercial-hvac-maintenance',
    query: 'Carry out preventive maintenance on commercial air conditioning equipment.',
    passages: [
      passage('Scheduled quarterly commercial air conditioning maintenance with contractors and recorded completion dates.', 0),
      passage('Serviced rooftop cooling units at retail sites by cleaning coils, replacing filters, and checking belt wear on a recurring schedule.', 1),
      passage('Responded to emergency calls for failed commercial air conditioning units after breakdowns.', 0),
      passage('Changed air filters in single-family homes and repaired residential window units.', 0),
      passage('Performed scheduled inspections of fire alarms and emergency exit lighting across retail stores.', 0),
      passage('Set seasonal thermostat schedules and tracked energy use across a portfolio of office buildings.', 0),
      passage('Processed purchase orders for air conditioning service parts and monitored warranty returns.', 0),
    ],
  },
  {
    id: 'import-customs-clearance',
    query: 'Prepare import customs declarations and coordinate clearance with customs brokers.',
    passages: [
      passage('Monitored inbound containers and notified warehouse teams when freight was released by customs.', 0),
      passage('Reviewed commercial invoices for billing accuracy and forwarded them to the import compliance team.', 0),
      passage('Filed export shipment declarations and tracked carrier bookings for international outbound freight.', 0),
      passage('Resolved appointment conflicts for inbound truck deliveries and updated dock capacities.', 0),
      passage('Archived copies of import declarations after brokers cleared each consignment.', 0),
      passage('Filed inbound entries with commodity codes and declared values, then worked with licensed brokers to release cargo held at port.', 1),
      passage('Audited customs duty charges against vendor invoices after goods were delivered to the distribution center.', 0),
    ],
  },
  {
    id: 'incident-response-lead',
    query: 'Lead production incident response and run root-cause reviews after service outages.',
    passages: [
      passage('Acknowledged page alerts on rotation and escalated production incidents to the designated incident commander.', 0),
      passage('Commanded outage bridges for customer-facing services, assigned recovery tasks, and facilitated postmortems to identify underlying failures.', 1),
      passage('Built dashboards used during production incident response and linked runbooks for common alerts.', 0),
      passage('Led customer communications during outages and posted hourly updates to the public status page.', 0),
      passage('Acted as escalation lead during live service interruptions and chaired follow-up investigations that traced contributing faults.', 1),
      passage('Authored incident response exercises and simulated outage scenarios for new engineers.', 0),
      passage('Investigated recurring defects in the staging environment before releases.', 0),
    ],
  },
  {
    id: 'multilingual-lesson-adaptation',
    query: 'Adapt classroom instruction to support students who are learning English.',
    passages: [
      passage('Translated family newsletters and interpreted conferences for parents of multilingual students.', 0),
      passage('Reported student language assessment results to classroom teachers for their planning meetings.', 0),
      passage('Used visual prompts, scaffolded reading, and flexible groups so recent arrivals could participate in grade-level lessons.', 1),
      passage('Coordinated interpreter scheduling for student enrollment and school assemblies.', 0),
      passage('Tutored native English speakers in exam preparation and academic essay writing.', 0),
      passage('Purchased supplemental workbooks for English learner classrooms and tracked borrowing.', 0),
      passage('Reworked science lessons with picture glossaries and sentence frames for students developing English proficiency.', 1),
    ],
  },
  {
    id: 'supplier-negotiation',
    query: 'Negotiate pricing and commercial terms directly with suppliers.',
    passages: [
      passage('Benchmarked supplier prices and gave a comparison of payment terms to the lead negotiator.', 0),
      passage('Renewed purchase orders at existing contract rates and resolved supplier invoice discrepancies.', 0),
      passage('Negotiated discounts and payment schedules with customers renewing software subscriptions.', 0),
      passage('Prepared summaries of supplier contract terms covering pricing, minimum order quantities, and delivery commitments.', 0),
      passage('Agreed lower unit costs and longer payment windows with packaging vendors during contract renewals.', 1),
      passage('Managed supplier onboarding and ran quarterly performance reviews for delivery and quality metrics.', 0),
      passage('Drafted communications announcing negotiated supplier rates after contracts were signed.', 0),
    ],
  },
  {
    id: 'privacy-access-requests',
    query: 'Fulfill data subject access requests for copies of personal information.',
    passages: [
      passage('Verified requesters, retrieved personal records from multiple systems, and delivered redacted copies through a secure portal.', 1),
      passage('Tracked data subject access requests and reminded case owners about upcoming response deadlines.', 0),
      passage('Processed deletion requests by coordinating record removal and confirming completion to account owners.', 0),
      passage('Responded to employee requests for access to business applications and internal shared folders.', 0),
      passage('Maintained the privacy notice and published instructions for submitting requests to exercise data rights.', 0),
      passage('Compiled customer account records and correspondence in response to right-of-access requests and issued the verified disclosures.', 1),
      passage('Reviewed privacy impact assessments for new systems and documented access-control risks.', 0),
    ],
  },
  {
    id: 'active-rn-license',
    query: 'Hold an active Registered Nurse (RN) license.',
    passages: [
      passage('Registered Nurse (RN) license expired following a career transition. Preparing to reinstate it.', 0, 'certifications'),
      passage('Licensed Practical Nurse (LPN), state board license active.', 0, 'certifications'),
      passage('Completed a Bachelor of Science in Nursing and scheduled the registered nursing licensing exam.', 0, 'education'),
      passage('Held a current Basic Life Support credential and assisted the nursing team with intake and record entry.', 0),
      passage('Checked active license status for registered nurses and followed up on missing renewal records.', 0),
      passage('Completed supervised clinical placements across two medical wards as part of a nursing degree.', 0, 'education'),
      passage('Served as a certified nursing assistant on a surgical unit, working with registered nurses and case managers.', 0),
    ],
  },
  {
    id: 'salesforce-permission-administration',
    query: 'Administer Salesforce user permissions and configure production access controls.',
    passages: [
      passage('Administered HubSpot user access and assigned permissions to account representatives and managers.', 0),
      passage('Submitted production Salesforce access requests to administrators and tracked approval status.', 0),
      passage('Exported Salesforce user permission reports for quarterly access reviews and escalated unusual access to platform administrators.', 0),
      passage('Configured permission sets in a practice Salesforce instance as part of Trailhead exercises.', 0, 'projects'),
      passage('Used Salesforce to log opportunities and build reports on pipeline changes for regional sales teams.', 0),
      passage('Wrote instructions for requesting Salesforce user permissions and accessing the support queue.', 0),
      passage('Verified that organization-level Salesforce access policies were signed off by business owners.', 0),
    ],
  },
  {
    id: 'randomized-onboarding-experiments',
    query: 'Design and run randomized A/B experiments for customer onboarding.',
    passages: [
      passage('Monitored onboarding funnel conversion and shared monthly drop-off trends with the experimentation team.', 0),
      passage('Compared completion rates before and after a global rollout of the redesigned onboarding flow.', 0),
      passage('Prepared alternative onboarding screen designs for an A/B test run by the product analytics team.', 0),
      passage('Led scheduled usability interviews to understand issues in a new account setup flow.', 0),
      passage('Ran randomized A/B experiments on paid advertising headlines and measured click-through rates.', 0),
      passage('Summarized A/B test results for onboarding and turned the findings into updates for help center content.', 0),
      passage('Applied release flags to ship the new onboarding version to all regions on a staggered schedule.', 0),
    ],
  },
  {
    id: 'multijurisdiction-payroll',
    query: 'Calculate and submit payroll for employees across multiple tax jurisdictions.',
    passages: [
      passage('Processed payroll calculations, tax withholdings, and submissions for employees at one Illinois worksite.', 0),
      passage('Collected approved time sheets and sent them to the payroll provider for workers in four states.', 0),
      passage('Reviewed consolidated payroll reports for multiple jurisdictions and flagged missing cost center codes.', 0),
      passage('Helped employees in several countries update direct deposit and correct wage statements through the payroll vendor.', 0),
      passage('Reviewed jurisdictional payroll tax rules for an internal guide and routed filing questions to external accountants.', 0),
      passage('Calculated contractor invoice payments and scheduled transfers across several currencies.', 0),
      passage('Maintained a calendar of multi-state payroll filing deadlines and tracked submission confirmations from the provider.', 0),
    ],
  },
];
