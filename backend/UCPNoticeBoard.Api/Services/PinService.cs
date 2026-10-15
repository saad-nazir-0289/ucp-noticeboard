using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Services;

public enum PinCheckStatus { Ok, Missing, Incorrect, Locked }

public sealed record PinCheckResult(PinCheckStatus Status, string? Message = null)
{
    public bool Succeeded => Status == PinCheckStatus.Ok;

    /// <summary>400 for a missing/wrong PIN, 429 while the account is locked.</summary>
    public ActionResult ToActionResult() => Status == PinCheckStatus.Locked
        ? new ObjectResult(Message) { StatusCode = StatusCodes.Status429TooManyRequests }
        : new BadRequestObjectResult(Message);
}

public interface IPinService
{
    /// <summary>
    /// The gate for every privileged action: passes if the request comes
    /// from a device this user unlocked (X-Device-Token header), otherwise
    /// requires their PIN, with lockout. First-ever PIN becomes their PIN.
    /// </summary>
    Task<PinCheckResult> AuthorizeAsync(User user, string? pin, string? missingMessage = null);

    /// <summary>PIN only (no device shortcut) — what unlocking a device requires.</summary>
    Task<PinCheckResult> VerifyPinAsync(User user, string? pin, string? missingMessage = null);

    /// <summary>Unlocks a device for this user; returns the token to hand to the client, once.</summary>
    Task<(string Token, DeviceSession Session)> CreateDeviceSessionAsync(User user, string label);

    /// <summary>Forgets the PIN and any lockout, so the next PIN used becomes the new one.</summary>
    void ClearPin(User user);

    /// <summary>Logs every unlocked device of this user out.</summary>
    Task RevokeDevicesAsync(int userId);

    /// <summary>Whether a device session is currently usable.</summary>
    bool IsActive(DeviceSession session, User user);
}

/// <summary>
/// Brute-force protection: 5 wrong PINs in a row lock the account for 15
/// minutes; every further 5 doubles the lock, up to a day. While locked,
/// even the correct PIN is refused. The count resets on a correct PIN.
///
/// The catch with any per-account lock is that someone who knows a Roll
/// Number can lock its owner out on purpose. Unlocked devices are the
/// answer to that: they don't need the PIN, so a Publisher's phone keeps
/// working through a lock — only unlocking a NEW device is blocked. An
/// Admin can also clear a lock (reset PIN), and the Admin's own can be
/// cleared with the AdminActivationSecret (see AuthController).
/// </summary>
public class PinService : IPinService
{
    public const string DeviceTokenHeader = "X-Device-Token";

    /// <summary>Set on a response when the request's device token was not accepted.</summary>
    public const string DeviceTokenStatusHeader = "X-Device-Token-Status";

    public const int AttemptsBeforeLock = 5;
    private static readonly TimeSpan FirstLock = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan MaxLock = TimeSpan.FromHours(24);
    private static readonly TimeSpan DeviceIdleExpiry = TimeSpan.FromDays(30);

    private const string DefaultMissingMessage = "Please enter your PIN (4–6 digits).";
    private static readonly System.Text.RegularExpressions.Regex PinFormat = new(@"^\d{4,6}$");

    private readonly AppDbContext _db;
    private readonly IHttpContextAccessor _http;
    private readonly TimeProvider _time;

    public PinService(AppDbContext db, IHttpContextAccessor http, TimeProvider time)
    {
        _db = db;
        _http = http;
        _time = time;
    }

    private DateTime Now => _time.GetUtcNow().UtcDateTime;

    public async Task<PinCheckResult> AuthorizeAsync(User user, string? pin, string? missingMessage = null)
    {
        var request = _http.HttpContext?.Request;
        var deviceToken = request?.Headers[DeviceTokenHeader].ToString();

        if (!string.IsNullOrEmpty(deviceToken))
        {
            var tokenHash = HashToken(deviceToken);
            var session = await _db.DeviceSessions.FirstOrDefaultAsync(d => d.TokenHash == tokenHash && d.UserId == user.Id);

            if (session is not null && session.ExpiresAt > Now && session.SecurityStamp == user.SecurityStamp)
            {
                session.LastUsedAt = Now;
                session.ExpiresAt = Now + DeviceIdleExpiry;
                await _db.SaveChangesAsync();
                return new PinCheckResult(PinCheckStatus.Ok);
            }

            // Expired, revoked, or from before a role change. Tell the
            // client so it drops the token and asks to unlock again.
            _http.HttpContext!.Response.Headers[DeviceTokenStatusHeader] = "invalid";
            if (string.IsNullOrWhiteSpace(pin))
            {
                return new PinCheckResult(PinCheckStatus.Missing,
                    "This device is no longer unlocked. Enter your PIN to unlock it again.");
            }
        }

        return await VerifyPinAsync(user, pin, missingMessage);
    }

    public async Task<PinCheckResult> VerifyPinAsync(User user, string? pin, string? missingMessage = null)
    {
        if (user.PinLockedUntil is { } lockedUntil && lockedUntil > Now)
        {
            return Locked(lockedUntil);
        }

        if (string.IsNullOrWhiteSpace(pin) || !PinFormat.IsMatch(pin))
        {
            return new PinCheckResult(PinCheckStatus.Missing, missingMessage ?? DefaultMissingMessage);
        }

        if (user.PinHash is null)
        {
            // First use: whatever they type becomes their PIN.
            user.PinHash = PinHasher.Hash(pin);
            ResetLockout(user);
            await _db.SaveChangesAsync();
            return new PinCheckResult(PinCheckStatus.Ok);
        }

        if (PinHasher.Verify(pin, user.PinHash))
        {
            var changed = user.FailedPinAttempts != 0 || user.PinLockedUntil is not null;
            ResetLockout(user);
            if (PinHasher.IsLegacy(user.PinHash))
            {
                user.PinHash = PinHasher.Hash(pin); // upgrade the old unsalted hash
                changed = true;
            }
            if (changed) await _db.SaveChangesAsync();
            return new PinCheckResult(PinCheckStatus.Ok);
        }

        user.FailedPinAttempts++;
        if (user.FailedPinAttempts % AttemptsBeforeLock == 0)
        {
            user.PinLockedUntil = Now + LockDuration(user.FailedPinAttempts);
            await _db.SaveChangesAsync();
            return Locked(user.PinLockedUntil.Value);
        }

        await _db.SaveChangesAsync();
        var left = AttemptsBeforeLock - user.FailedPinAttempts % AttemptsBeforeLock;
        return new PinCheckResult(PinCheckStatus.Incorrect,
            $"Incorrect PIN. {left} {(left == 1 ? "attempt" : "attempts")} left before your account is temporarily locked.");
    }

    public async Task<(string Token, DeviceSession Session)> CreateDeviceSessionAsync(User user, string label)
    {
        var token = Base64UrlEncode(RandomNumberGenerator.GetBytes(32));
        var session = new DeviceSession
        {
            UserId = user.Id,
            TokenHash = HashToken(token),
            SecurityStamp = user.SecurityStamp ?? string.Empty,
            Label = label.Length > 200 ? label[..200] : label,
            CreatedAt = Now,
            LastUsedAt = Now,
            ExpiresAt = Now + DeviceIdleExpiry,
        };
        _db.DeviceSessions.Add(session);
        await _db.SaveChangesAsync();
        return (token, session);
    }

    public void ClearPin(User user)
    {
        user.PinHash = null;
        ResetLockout(user);
    }

    public async Task RevokeDevicesAsync(int userId)
    {
        await _db.DeviceSessions.Where(d => d.UserId == userId).ExecuteDeleteAsync();
    }

    /// <summary>Whether a device session is currently usable — shared with the device list endpoints.</summary>
    public bool IsActive(DeviceSession session, User user) =>
        session.ExpiresAt > Now && session.SecurityStamp == user.SecurityStamp;

    public static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    private static TimeSpan LockDuration(int failedAttempts)
    {
        var lockNumber = failedAttempts / AttemptsBeforeLock; // 1st lock, 2nd lock, ...
        var minutes = FirstLock.TotalMinutes * Math.Pow(2, Math.Min(lockNumber - 1, 10));
        return TimeSpan.FromMinutes(Math.Min(minutes, MaxLock.TotalMinutes));
    }

    private PinCheckResult Locked(DateTime until)
    {
        var minutes = (int)Math.Ceiling((until - Now).TotalMinutes);
        return new PinCheckResult(PinCheckStatus.Locked,
            $"Too many incorrect PINs. Your account is locked for {minutes} minute{(minutes == 1 ? "" : "s")}. " +
            "Try again later or ask the Admin to reset your PIN.");
    }

    private static void ResetLockout(User user)
    {
        user.FailedPinAttempts = 0;
        user.PinLockedUntil = null;
    }

    private static string Base64UrlEncode(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
