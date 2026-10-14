using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Services;

namespace UCPNoticeBoard.Api.Controllers;

/// <summary>
/// "Unlock this phone": a Publisher/Admin enters their PIN once on a
/// device and gets a device token; sent as the X-Device-Token header, it
/// stands in for the PIN on every privileged action (see PinService).
/// Students never see any of this — they have nothing to unlock.
/// </summary>
[ApiController]
[Route("auth")]
[Authorize(Roles = "Publisher,Admin")]
public class DevicesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPinService _pins;

    public DevicesController(AppDbContext db, IPinService pins)
    {
        _db = db;
        _pins = pins;
    }

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);

    /// <summary>Needs the PIN itself (an unlocked device can't unlock another).</summary>
    [HttpPost("unlock")]
    [EnableRateLimiting("pin-check")]
    public async Task<ActionResult<UnlockDeviceResponse>> Unlock([FromBody] UnlockDeviceRequest request)
    {
        var user = await _db.Users.FindAsync(CurrentUserId);
        if (user is null) return Unauthorized();

        var pinCheck = await _pins.VerifyPinAsync(user, request.Pin);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();

        var label = string.IsNullOrWhiteSpace(request.Label)
            ? DescribeUserAgent(Request.Headers.UserAgent.ToString())
            : request.Label.Trim();
        var (token, session) = await _pins.CreateDeviceSessionAsync(user, label);

        return Ok(new UnlockDeviceResponse(token, session.Id, session.ExpiresAt));
    }

    /// <summary>The caller's own unlocked devices, marking the one making this request.</summary>
    [HttpGet("devices")]
    public async Task<ActionResult<List<DeviceSessionDto>>> GetDevices()
    {
        var user = await _db.Users.FindAsync(CurrentUserId);
        if (user is null) return Unauthorized();

        var currentToken = Request.Headers[PinService.DeviceTokenHeader].ToString();
        var currentHash = string.IsNullOrEmpty(currentToken) ? null : PinService.HashToken(currentToken);

        var sessions = await _db.DeviceSessions
            .Where(d => d.UserId == user.Id)
            .OrderByDescending(d => d.LastUsedAt)
            .ToListAsync();

        return Ok(sessions
            .Where(d => _pins.IsActive(d, user))
            .Select(d => new DeviceSessionDto(d.Id, d.Label, d.CreatedAt, d.LastUsedAt, d.TokenHash == currentHash))
            .ToList());
    }

    /// <summary>Logs one of the caller's own devices out. Only ever reduces access, so no PIN.</summary>
    [HttpDelete("devices/{id}")]
    public async Task<IActionResult> RevokeDevice(int id)
    {
        var deleted = await _db.DeviceSessions
            .Where(d => d.Id == id && d.UserId == CurrentUserId)
            .ExecuteDeleteAsync();

        return deleted == 0 ? NotFound() : NoContent();
    }

    /// <summary>"Chrome on Android" — enough to recognise a device in a list.</summary>
    private static string DescribeUserAgent(string userAgent)
    {
        string platform =
            userAgent.Contains("Android") ? "Android" :
            userAgent.Contains("iPhone") || userAgent.Contains("iPad") ? "iPhone" :
            userAgent.Contains("Windows") ? "Windows" :
            userAgent.Contains("Mac OS") ? "Mac" :
            userAgent.Contains("Linux") ? "Linux" : "Unknown device";
        string browser =
            userAgent.Contains("Edg/") ? "Edge" :
            userAgent.Contains("OPR/") ? "Opera" :
            userAgent.Contains("Firefox/") ? "Firefox" :
            userAgent.Contains("Chrome/") ? "Chrome" :
            userAgent.Contains("Safari/") ? "Safari" : "Browser";
        return $"{browser} on {platform}";
    }
}
