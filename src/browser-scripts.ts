export const currentFilterScript = `
(() => {
  const controls = Array.from(document.querySelectorAll('[role="button"], button'));
  const control = controls.find((element) => /^\\d+\\s+(days|días)$|^(Custom|Personalizado)$/i.test(element.innerText.trim()));
  return control ? control.innerText.trim() : null;
})()
`;

export const contentReadyScript = `
(() => {
  const controls = Array.from(document.querySelectorAll('[role="button"], button'));
  return controls.some((element) => /^\\d+\\s+(days|días)$/i.test(element.innerText.trim()));
})()
`;

export const weeklyCardsScript = `
(() => {
  const analyticsLinks = Array.from(document.querySelectorAll('a[href*="/analytics/post-summary/urn:li:activity:"]'));
  const cards = analyticsLinks.map((analyticsLink) => {
    let container = analyticsLink.parentElement;
    for (let depth = 0; depth < 10 && container; depth += 1) {
      const publicLink = container.querySelector('a[href*="/feed/update/urn:li:share:"]');
      if (publicLink) {
        return {
          analyticsUrl: analyticsLink.href,
          cardText: analyticsLink.innerText,
          commentary: publicLink.innerText,
          publicUrl: publicLink.href,
        };
      }
      container = container.parentElement;
    }
    return null;
  }).filter(Boolean);
  const showMore = Array.from(document.querySelectorAll('a, button')).find(
    (element) => ['Show more', 'Mostrar más'].includes(element.innerText.trim()),
  );
  return { cards, showMoreText: showMore ? showMore.innerText.trim() : null };
})()
`;

export const bodyTextScript = "document.body.innerText";

export const detailReadyScript = `
(() => {
  const text = document.body.innerText;
  const hasImpressions = /(^|\\n)(Impressions|Impresiones)(\\n|$)/i.test(text);
  const hasReach = /(^|\\n)(Members reached|Miembros alcanzados)(\\n|$)/i.test(text);
  return location.href.includes('/analytics/post-summary/') && hasImpressions && hasReach;
})()
`;

export const analyticsLinkScript = `
(() => {
  const link = Array.from(document.querySelectorAll('a[href*="/analytics/post-summary/urn:li:activity:"]'))[0];
  return link ? link.href : null;
})()
`;

export const analyticsLinkReadyScript = `
Boolean(document.querySelector('a[href*="/analytics/post-summary/urn:li:activity:"]'))
`;

export const publicPostLinkScript = `
(() => {
  const link = Array.from(document.querySelectorAll('a[href*="/feed/update/urn:li:share:"]'))[0];
  return link ? link.href : null;
})()
`;
