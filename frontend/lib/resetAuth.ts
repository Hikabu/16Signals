export function resetAuth() {
  if (typeof window === "undefined") return;

  window.localStorage.clear();

  document.cookie.split(";").forEach((c) => {
    document.cookie =
      c.split("=")[0] +
      "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
  });

  window.location.reload();
}

