const actionVerbs = [
  'administer', 'analy[sz]e', 'approve', 'assemble', 'audit', 'authori[sz]e', 'automate', 'build', 'calculate', 'carry out',
  'collect', 'communicate', 'conduct', 'configure', 'coordinate', 'create', 'deliver', 'deploy', 'design', 'develop',
  'document', 'draft', 'edit', 'evaluate', 'execute', 'file', 'fix', 'implement', 'inspect', 'install',
  'investigate', 'lead', 'maintain', 'manage', 'measure', 'monitor', 'negotiate', 'operate', 'organize',
  'perform', 'prepare', 'present', 'process', 'publish', 'reconcile', 'review', 'run', 'schedule', 'screen', 'send',
  'set up', 'sign off(?: on)?', 'submit', 'supervise', 'test', 'train', 'update', 'validate', 'verify', 'write',
];
const action = new RegExp('^(' + actionVerbs.join('|') + ')(?:\\s+(.+))?$', 'i');
const modal = /^(?:(?:you|(?:the )?applicants?|(?:the )?candidates?)\s+(?:will|must|should)\s+|(?:must|should|ability to)\s+)/i;
const alternative = /\b(?:or|either|neither|nor|versus|instead of|rather than)\b/i;
const sharedContext = /\b(?:it|its|them|they|their|that|those|former|latter|same|both|only|not|except|unless|without|if|when|where|while|until|before|after|then|subject to|as needed|as applicable)\b/i;
const subordinate = /\b(?:that|which|who|whom|whose|to)\b/i;
const preposition = /^(?:about|across|against|as|at|by|during|for|from|in|into|of|on|out|over|through|to|under|with|within)\b/i;
const nounLikeAction = /^(?:audit|build|design|draft|document|file|fix|measure|monitor|process|review|schedule|test|train|update)$/i;
const determiner = /^(?:a|an|each|every|new|the|these|this|your)\b/i;
const existingScope = /\b(?:for|within|across|in|on|to|with)\b/i;
const sharedDomain = /\bfor\s+(?!approval\b|review\b|sign[ -]off\b)(.+)$/i;
const trainingMaterials = /^(.+?\btraining)\s+(?:materials|handouts|curricula|curriculum|plans|guides)$/i;
const genericSession = /^(sessions|classes|workshops)\s+to\s+(.+)$/i;

export function requirementParts(query: string): string[] {
  const text = query.trim();
  if (!text || /[\n,;:!?()[\]"]/u.test(text) || /\.(?=\s)/u.test(text) ||
      alternative.test(text) || sharedContext.test(text)) return [query];

  const punctuation = text.endsWith('.') ? '.' : '';
  const prefix = text.match(modal)?.[0] ?? '';
  const duties = text.slice(prefix.length, text.length - punctuation.length).split(/\s+and\s+/i);
  if (duties.length !== 2) return [query];
  const first = duties[0].match(action);
  const second = duties[1].match(action);
  const secondObject = second?.[2]?.trim();
  if (!first || !second || !secondObject || first[1].toLowerCase() === second[1].toLowerCase()) return [query];

  const firstObject = first[2]?.trim();
  if (firstObject) {
    // The second verb might instead be part of an object list or a subordinate clause.
    if (subordinate.test(firstObject) || (nounLikeAction.test(second[1]) && !determiner.test(secondObject))) return [query];
  } else if (preposition.test(secondObject)) {
    return [query];
  }

  const nextVerb = prefix || !/^[A-Z]/.test(first[1])
    ? second[1] : second[1][0].toUpperCase() + second[1].slice(1);
  let firstSubject = firstObject ?? secondObject;
  let secondSubject = secondObject;
  if (firstObject && !existingScope.test(firstObject)) {
    const topic = firstObject.match(trainingMaterials)?.[1];
    const session = secondObject.match(genericSession);
    const domain = secondObject.match(sharedDomain)?.[1];
    if (topic && session && /^(?:deliver|conduct|lead|run)$/i.test(second[1])) {
      firstSubject += ` for ${session[2]}`;
      secondSubject = `${topic} ${secondObject}`;
    } else if (domain) {
      // The trailing domain can apply to both duties. Keep that constraint in both checks.
      firstSubject += ` for ${domain}`;
    }
  }
  return [
    prefix + first[1] + ' ' + firstSubject + punctuation,
    prefix + nextVerb + ' ' + secondSubject + punctuation,
  ];
}

export function alternativeDuties(query: string): string[] {
  const text = query.trim();
  const options = text.replace(/^(?:either\s+)/i, '').replace(/[.]$/, '').split(/\s+or\s+/i);
  if (options.length !== 2) return [query];
  const first = options[0].replace(modal, '').match(action);
  const second = options[1].match(action);
  // A verb without its own object can be part of a list rather than a distinct alternative.
  if (!first?.[2] || !second?.[2]) return [query];
  const parts = requirementParts(`${options.join(' and ')}${text.endsWith('.') ? '.' : ''}`);
  return parts.length === 2 ? parts : [query];
}
