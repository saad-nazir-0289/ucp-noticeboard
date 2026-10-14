namespace UCPNoticeBoard.Api.Models;

public enum UserRole
{
    Student = 0,
    Publisher = 1,
    Admin = 2
}

public class User
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string RollNumber { get; set; } = string.Empty;
    public UserRole Role { get; set; } = UserRole.Student;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastSeenAt { get; set; }
    public int ViewCount { get; set; } = 0;

    // One-time activation code — redeemed once to become Publisher/Admin,
    // then cleared. No longer required on every login (that model was
    // replaced by the PIN below, specifically so Publisher/Admin role
    // VISIBILITY works on any device with zero friction — only the
    // actual act of creating/editing/deleting a notice is gated now).
    public string? PrivilegedCredential { get; set; }

    // Rotated every time this account's role changes. Embedded in every
    // JWT issued to this user. A privileged request whose token carries a
    // stamp that no longer matches the current database value is rejected
    // immediately — even if the token itself hasn't expired yet. This is
    // what makes a demotion take effect instantly instead of waiting out
    // whatever time is left on an already-issued token.
    public string? SecurityStamp { get; set; } = Guid.NewGuid().ToString("N");

    // The actual security boundary for anything that changes public
    // content. Null until the Publisher/Admin's first-ever notice action,
    // at which point whatever they type becomes their PIN going forward.
    // Memorized, not device-bound — this is what makes it work seamlessly
    // across devices, unlike the credential above. Never stored in
    // plaintext; only a hash.
    public string? PinHash { get; set; }

    // Per-account brute-force protection (see PinService): wrong PINs in
    // a row, and when the resulting lock ends. The per-IP rate limit alone
    // doesn't stop a guesser who switches networks; this does.
    public int FailedPinAttempts { get; set; }
    public DateTime? PinLockedUntil { get; set; }

    public ICollection<Notice> Notices { get; set; } = new List<Notice>();
}
