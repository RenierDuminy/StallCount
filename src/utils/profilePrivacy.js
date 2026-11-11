// POPIA: how a person is named in staff-facing lists (event access control,
// the tournament director's event-linked crew). Email addresses are never
// shown. Some profiles store their email as their name (the sign-up default);
// for those the part before the @ is shown and the domain is starred:
// "jane.doe@gmail.com" -> "jane.doe@*****".

export function displayProfileName(user, fallback = "Unnamed profile") {
  const name = typeof user?.fullName === "string" ? user.fullName.trim() : "";
  if (!name) return fallback;
  const at = name.indexOf("@");
  return at === -1 ? name : `${name.slice(0, at)}@*****`;
}
