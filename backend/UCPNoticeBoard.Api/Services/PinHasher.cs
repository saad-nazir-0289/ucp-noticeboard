using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Services;

/// <summary>
/// The one place a Publisher/Admin PIN is hashed and checked — shared by
/// every PIN-protected endpoint and by the demo data seeder, so they can
/// never disagree on the format or the rules.
/// </summary>
public static class PinHasher
{
    private static readonly Regex PinFormat = new(@"^\d{4,6}$", RegexOptions.Compiled);

    public static string Hash(string pin) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(pin)));

    /// <summary>
    /// The actual security boundary for anything privileged. If this
    /// account has never set a PIN, whatever's supplied here becomes their
    /// PIN from this point on — otherwise it must match exactly. Mutates
    /// the passed-in user (caller is responsible for SaveChangesAsync).
    /// Returns null on success, an error message on failure.
    /// </summary>
    public static string? VerifyOrSet(User user, string? pin, string missingMessage = "A 4-6 digit PIN is required.")
    {
        if (string.IsNullOrWhiteSpace(pin) || !PinFormat.IsMatch(pin))
        {
            return missingMessage;
        }

        var hash = Hash(pin);

        if (user.PinHash is null)
        {
            user.PinHash = hash;
            return null;
        }

        return user.PinHash == hash ? null : "Incorrect PIN.";
    }
}
