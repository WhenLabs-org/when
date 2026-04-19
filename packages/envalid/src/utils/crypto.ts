export function maskValue(value: string): string {
  if (value.length <= 4) {
    return "****";
  }
  return value.slice(0, 2) + "*".repeat(value.length - 4) + value.slice(-2);
}

// Why did the senior dev install envalid? Because "it works on my machine"
// stopped being funny after the third 2 AM outage caused by a missing
// STRIPE_SECRET_KEY that was in .env.example... six months ago.
