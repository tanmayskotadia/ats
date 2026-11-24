import { cleanText } from './resume.ts';
import type { SectionKey } from './resume.ts';

type OwnershipCheck = (passage: string, section: SectionKey) => boolean;

const requirementPrefix = /^(?:(?:required|preferred|key|core)\s+)*(?:responsibilities|duties|requirements|experience)\s*:\s*/i;
const expectationPrefix = /^(?:(?:(?:you|applicants?|candidates?)\s+)?(?:will|must|should)\s+|ability to\s+|experience\s+(?:in|with)\s+|(?:hands-on|direct|independent)\s+|responsible for\s+)*/i;
const approval = /^(?:approv(?:e|ing)|authori[sz](?:e|ing)|sign(?:ing)?[ -]off|certif(?:y|ying))\b/i;
const leadership = /^(?:lead(?:ing)?|chair(?:ing)?|direct(?:ing)?|oversee(?:ing)?|supervis(?:e|ing)|head(?:ing)?|manage|managing|own(?:ing)?)\b/i;
const practicalWork = /^(?:adapt(?:ing)?|administer(?:ing)?|build(?:ing)?|carry out|carrying out|complet(?:e|ing)|conduct(?:ing)?|creat(?:e|ing)|deliver(?:ing)?|deploy(?:ing)?|design(?:ing)?|develop(?:ing)?|draft(?:ing)?|execut(?:e|ing)|fulfill?(?:ing)?|implement(?:ing)?|maintain(?:ing)?|negotiat(?:e|ing)|operat(?:e|ing)|perform(?:ing)?|prepar(?:e|ing)|process(?:ing)?|run(?:ning)?|test(?:ing)?|writ(?:e|ing))\b/i;
const handsOnPractice = /\bhands-on\s+(?:[\p{L}\p{N}+#.-]+\s+){0,6}(?:administration|configuration|development|implementation|operation|production|testing)\b/iu;

const applicantPrefix = /^(?:[•*\-]\s*|\d+[.)]\s+)?(?:(?:i|we|the applicant)\s+)?(?:(?:also|jointly|personally|directly|independently|then)\s+)*/i;
const supportVerb = /^(?:assist(?:ed|ing)|delegat(?:ed|ing)|escala(?:ted|ting)|forward(?:ed|ing)|hand(?:ed|ing) off|help(?:ed|ing)|observ(?:ed|ing)|outsource[ds]?|refer(?:red|ring)|rout(?:ed|ing)|schedul(?:ed|ing)|shadow(?:ed|ing)|support(?:ed|ing))\b/i;
const participatoryHelp = /^helped (?:to\s+)?(?:co-)?(?:build|conduct|create|deploy|design|develop|implement|lead|operate|perform|run|write)\b/i;
const independentlyPerformed = /^(?:adapted|administered|approved|authorized|built|carried out|chaired|commanded|completed|conducted|created|delivered|deployed|designed|developed|directed|drafted|executed|fit|fulfilled|implemented|led|maintained|managed|negotiated|operated|owned|performed|prepared|processed|provisioned|ran|retimed|reviewed|serviced|signed(?: off)?|supervised|tested|wrote)\b/i;
const independentContinuation = /(?:^|[\n;!?]|(?<=\.)\s+(?=\p{Lu})|,?\s+(?:and(?: then)?|but(?: also)?|then|while|whereas)\s+(?=(?:i\b|we\b|(?:also|jointly|personally|directly|independently)\b|[\p{L}-]+ed\b|(?:built|fit|led|ran|wrote)\b)))/iu;
const assistanceWithOwnWork = /\b(?:by|through)\s+(?:adapting|administering|approving|auditing|building|carrying out|conducting|creating|deploying|designing|developing|drafting|executing|fulfilling|implementing|inspecting|installing|leading|maintaining|negotiating|operating|performing|preparing|processing|provisioning|repairing|resolving|running|servicing|signing off|testing|writing)\b/i;

const grantApproval = '(?:gave|granted|issued|provided)\\s+(?:(?:final|formal|written)\\s+)?(?:approval|authori[sz]ation|sign[ -]off)';
const approve = `(?:approved|authori[sz]ed|certified|sealed|signed(?:[ -]off)?|stamped|${grantApproval})`;
const approvalAction = new RegExp(`^${approve}\\b(?!\\s+by\\b)`, 'i');
const leadershipAction = /^(?:acted as (?:the )?(?:\w+\s+){0,3}(?:lead|chair|director|negotiator)|chaired|co-led|commanded|directed|headed|led|managed|oversaw|owned|served as (?:the )?(?:\w+\s+){0,3}(?:lead|chair|director|negotiator)|supervised)\b(?!\s+by\b)/i;
const approvalElsewhere = /\b(?:approvals?|authori[sz]ation|signatures?|sign[ -]off)\s+(?:(?:was|were|is|are)\s+)?(?:provided|issued|granted|given|completed|handled|performed)\s+by\b|\b(?:approved|authorized|authorised|signed(?:[ -]off)?)\s+by\b|\b(?:for|awaiting|after)\s+(?:(?:independent|final|formal|external|separate)\s+)?(?:approval|authorization|sign[ -]off)\b/i;
const otherActor = '(?:another|external|outsourced|third-party|the|an?|\\d+|one|two|three|four|five|six|several) (?:[\\p{L}\\p{N}&/.-]+ ){0,4}(?:administrator|analyst|architect|board|committee|contractor|controller|department|developer|director|employee|engineer|lead|manager|operator|provider|reviewer|specialist|staff|supervisor|team|vendor|worker)s?';
const otherApprover = new RegExp(
  `\\b(?:${otherActor}|(?:after|once|when) (?:leadership|management))\\s+(?:who\\s+)?(?:had\\s+)?${approve}\\b`,
  'iu',
);
const externalAction = '(?:administer(?:ed|s|ing)?|build(?:s|ing)?|built|conduct(?:ed|s|ing)?|deploy(?:ed|s|ing)?|design(?:ed|s|ing)?|develop(?:ed|s|ing)?|draft(?:ed|s|ing)?|implement(?:ed|s|ing)?|lead(?:s|ing)?|led|manage[ds]?|managing|operat(?:e[ds]?|ing)|perform(?:ed|s|ing)?|process(?:ed|es|ing)?|ran|run(?:s|ning)?|writ(?:e[ns]?|ing)|wrote)';
const dutyElsewhere = new RegExp(
  `\\b(?:${externalAction}\\s+by ${otherActor}|${otherActor}\\s+(?:who |to |that |would |was responsible for |were responsible for )?${externalAction})\\b`,
  'iu',
);
const supervisedOthers = new RegExp(
  `^(?:managed|oversaw|supervised|assigned|advised|led|monitored)\\b[^;.!?]{0,80}\\bwho ${externalAction}\\b`,
  'iu',
);
const explicitThirdPartyDuty = /\b(?:with|under)\s+(?:\w+\s+){0,4}(?:ownership|responsibility)\s+(?:held|retained)\s+by\b/i;
const delegatedPurpose = /\bso (?:that )?they (?:could|would|can|will) (?:teach|train|deliver|approve|complete|conduct|operate|run|perform|do)\b/i;
const alternativeRequirement = /\b(?:or|either|one of)\b/i;
const audienceDuty = /^(?:communicate|deliver|distribute|present|provide|report|send|submit|teach|train)\b/i;
const audienceEvidence = /^(?:communicated|delivered|distributed|presented|provided|reported|sent|submitted|taught|trained)\b/i;
const completionDuty = /^(?:deliver|present|submit|teach|train)\b/i;
const preparationOnly = /^(?:assembled|authored|briefed|compiled|created|designed|drafted|edited|maintained|monitored|planned|prepared|scheduled|tracked|updated|wrote)\b/i;
const completionEvidence = /\b(?:delivered|delivering|filed|filing|presented|presenting|submitted|submitting|taught|teaching|trained|training attendees)\b/i;
const namedAudience = /\bto\s+((?:[\p{L}-]+\s+){1,6}?)(?:associates?|clients?|customers?|employees?|hires?|managers?|members?|staff|students?|supervisors?|teams?|trainees?|workers?)\b/iu;
const audienceModifiers = new Set(['a', 'an', 'the', 'new', 'incoming', 'current', 'existing', 'other', 'all', 'our', 'their']);

function audienceTerms(text: string) {
  return (text.match(namedAudience)?.[1].toLowerCase().match(/[\p{L}]+/gu) ?? [])
    .map(word => word.replace(/s$/, '')).filter(word => !audienceModifiers.has(word));
}

export function compileWorkOwnershipCheck(criterion: string): OwnershipCheck | undefined {
  const duty = cleanText(criterion).replace(requirementPrefix, '').replace(applicantPrefix, '').replace(expectationPrefix, '');
  if (alternativeRequirement.test(duty)) return;
  const actions = duty.split(/\s+(?:and|&)\s+/i);
  const wantsApproval = actions.some(action => approval.test(action));
  const wantsLeadership = actions.some(action => leadership.test(action));
  const wantsDirectWork = actions.some(action => practicalWork.test(action)) || handsOnPractice.test(duty);
  const audience = audienceDuty.test(duty) ? audienceTerms(duty) : [];
  const wantsCompletion = actions.some(action => completionDuty.test(action));
  if (!wantsApproval && !wantsLeadership && !wantsDirectWork && !wantsCompletion && !audience.length) return;

  return passage => {
    const clauses = cleanText(passage).split(independentContinuation)
      .map(clause => clause.replace(applicantPrefix, '')).filter(Boolean);
    if (wantsApproval && clauses.some(clause => approvalElsewhere.test(clause) || otherApprover.test(clause)) &&
      !clauses.some(clause => approvalAction.test(clause))) return false;
    if (wantsCompletion && clauses.length && clauses.every(clause => preparationOnly.test(clause)) &&
      !clauses.some(clause => completionEvidence.test(clause))) return false;

    if (audience.length) {
      const observed = clauses.filter(clause => audienceEvidence.test(clause)).map(audienceTerms).filter(terms => terms.length);
      if (observed.length && !observed.some(terms => terms.some(term => audience.includes(term)))) return false;
    }

    const isSupport = (clause: string) => supportVerb.test(clause) &&
      !participatoryHelp.test(clause) && !assistanceWithOwnWork.test(clause);
    if (clauses.length && clauses.every(isSupport)) return false;

    const assignsDutyElsewhere = (clause: string) => dutyElsewhere.test(clause) ||
      supervisedOthers.test(clause) || explicitThirdPartyDuty.test(clause) || delegatedPurpose.test(clause);
    const independentApplicantAction = (clause: string) => {
      if (isSupport(clause)) return false;
      if (wantsApproval && approvalAction.test(clause)) return true;
      if (wantsLeadership && !wantsDirectWork && leadershipAction.test(clause)) return true;
      if (assignsDutyElsewhere(clause)) return false;
      return wantsDirectWork && (independentlyPerformed.test(clause) || assistanceWithOwnWork.test(clause));
    };
    return !clauses.some(assignsDutyElsewhere) || clauses.some(independentApplicantAction);
  };
}
