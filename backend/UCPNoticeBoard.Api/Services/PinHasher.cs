using System.Security.Cryptography;
using System.Text;

namespace UCPNoticeBoard.Api.Services;

/// <summary>
/// The one place a Publisher/Admin PIN is turned into the value stored in
/// User.PinHash — shared by the controllers that check PINs and by the
/// demo data seeder, so they can never disagree on the format.
/// </summary>
public static class PinHasher
{
    public static string Hash(string pin) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(pin)));
}
