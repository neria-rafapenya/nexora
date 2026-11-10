export function businessDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function documentStatus(doc, versions, today = businessDate()) {
  const latest = versions.find((v) => v.id === doc.data.latestVersionId),
    current = versions.find((v) => v.id === doc.data.currentVersionId);
  if (doc.data.archived) return "ARCHIVED";
  if (!latest) return "DRAFT";
  if (
    doc.data.reviewedLatestVersionId !== latest.id &&
    latest.data.state === "PENDING_REVIEW"
  )
    return "PENDING_REVIEW";
  if (!current)
    return latest.data.state === "WITHDRAWN"
      ? "WITHDRAWN"
      : latest.data.state === "REJECTED"
        ? "REJECTED"
        : "PENDING_REVIEW";
  if (current.data.state !== "APPROVED") return current.data.state;
  if (current.data.effectiveFrom && current.data.effectiveFrom > today)
    return "NOT_EFFECTIVE";
  if (current.data.expiresAt && current.data.expiresAt < today)
    return "EXPIRED";
  if (
    current.data.expiresAt &&
    Date.parse(current.data.expiresAt) - Date.parse(today) <= 30 * 86400000
  )
    return "EXPIRING";
  return "VALID";
}
export function usableDocument(
  doc,
  version,
  versions,
  productId,
  today = businessDate(),
) {
  return (
    !!doc &&
    !!version &&
    doc.data.currentVersionId === version.id &&
    version.data.documentId === doc.id &&
    doc.data.productIds.includes(productId) &&
    ["VALID", "EXPIRING"].includes(documentStatus(doc, versions, today))
  );
}

export function documentValidity(version, today = businessDate()) {
  if (!version) return "NO_DATE";
  if (version.data.expiresAt && version.data.expiresAt < today)
    return "EXPIRED";
  if (version.data.effectiveFrom && version.data.effectiveFrom > today)
    return "NOT_EFFECTIVE";
  if (
    version.data.expiresAt &&
    Date.parse(version.data.expiresAt) - Date.parse(today) <= 30 * 86400000
  )
    return "EXPIRING";
  return version.data.expiresAt ? "VALID" : "NO_DATE";
}
