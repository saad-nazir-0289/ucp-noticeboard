using System.Security.Cryptography;
using System.Text;

namespace UCPNoticeBoard.Api.Services;

/// <summary>
/// Turns a PIN into what's stored in User.PinHash, and checks a PIN
/// against it. Pure functions — the lockout and device rules that decide
/// WHEN a PIN may be checked live in <see cref="PinService"/>.
///
/// Format: "pbkdf2-sha256$iterations$salt$hash" (salt/hash base64). Salted
/// so identical PINs don't share a hash and precomputed tables don't work;
/// slow so each guess against a leaked hash costs real CPU. Honest limit:
/// a 4-6 digit PIN has at most a million values, so a determined attacker
/// with a leaked database can still brute-force one offline — the online
/// lockout is the protection that matters day to day.
///
/// Older accounts may still hold the original unsalted SHA-256 hex; those
/// verify through <see cref="IsLegacy"/> and are upgraded on next use.
/// </summary>
public static class PinHasher
{
    private const string Scheme = "pbkdf2-sha256";
    private const int Iterations = 600_000; // OWASP's PBKDF2-HMAC-SHA256 recommendation
    private const int SaltBytes = 16;
    private const int HashBytes = 32;

    public static string Hash(string pin)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var hash = Rfc2898DeriveBytes.Pbkdf2(pin, salt, Iterations, HashAlgorithmName.SHA256, HashBytes);
        return $"{Scheme}${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    public static bool Verify(string pin, string stored)
    {
        if (IsLegacy(stored))
        {
            var legacy = Encoding.ASCII.GetBytes(Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(pin))));
            return CryptographicOperations.FixedTimeEquals(legacy, Encoding.ASCII.GetBytes(stored.ToUpperInvariant()));
        }

        var parts = stored.Split('$');
        if (parts.Length != 4 || parts[0] != Scheme || !int.TryParse(parts[1], out var iterations))
        {
            return false;
        }

        var salt = Convert.FromBase64String(parts[2]);
        var expected = Convert.FromBase64String(parts[3]);
        var actual = Rfc2898DeriveBytes.Pbkdf2(pin, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    /// <summary>The original format: 64 hex characters of unsalted SHA-256.</summary>
    public static bool IsLegacy(string stored) => !stored.StartsWith(Scheme + "$", StringComparison.Ordinal);
}
