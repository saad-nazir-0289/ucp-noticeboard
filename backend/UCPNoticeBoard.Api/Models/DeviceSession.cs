namespace UCPNoticeBoard.Api.Models;

/// <summary>
/// "This phone is unlocked": created when a Publisher/Admin enters their
/// PIN once on a device (POST /auth/unlock). While it's valid, that device
/// sends its token instead of typing the PIN for every action.
///
/// Only a hash of the token is stored — it's a 256-bit random value, so a
/// plain SHA-256 is enough (unlike a short PIN, it can't be brute-forced).
/// A session dies when it expires (30 days after last use), when it's
/// revoked, or when the user's SecurityStamp changes (role change, admin
/// PIN recovery) — it's only valid while <see cref="SecurityStamp"/> still
/// matches the user's current one.
/// </summary>
public class DeviceSession
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public string SecurityStamp { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime LastUsedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }

    public User? User { get; set; }
}
