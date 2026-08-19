using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Controllers;

[ApiController]
[Route("push")]
[Authorize]
public class PushController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _configuration;

    public PushController(AppDbContext db, IConfiguration configuration)
    {
        _db = db;
        _configuration = configuration;
    }

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);

    /// <summary>The PWA needs this to register a push subscription with the browser.</summary>
    [HttpGet("vapid-public-key")]
    public ActionResult<VapidPublicKeyResponse> GetVapidPublicKey()
    {
        var publicKey = _configuration["VapidSettings:PublicKey"];
        if (string.IsNullOrWhiteSpace(publicKey) || publicKey.StartsWith("REPLACE_WITH"))
        {
            return StatusCode(503, "Push notifications aren't configured yet.");
        }
        return Ok(new VapidPublicKeyResponse(publicKey));
    }

    [HttpPost("subscribe")]
    public async Task<IActionResult> Subscribe([FromBody] PushSubscribeRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Endpoint) || string.IsNullOrWhiteSpace(request.P256dh) || string.IsNullOrWhiteSpace(request.Auth))
        {
            return BadRequest("endpoint, p256dh, and auth are all required.");
        }

        var existing = await _db.PushSubscriptions.FirstOrDefaultAsync(p => p.Endpoint == request.Endpoint);
        if (existing is not null)
        {
            // Same device re-subscribing (e.g. after clearing site data) —
            // just re-associate it with whoever is currently logged in.
            existing.UserId = CurrentUserId;
            existing.P256dh = request.P256dh;
            existing.Auth = request.Auth;
        }
        else
        {
            _db.PushSubscriptions.Add(new PushSubscription
            {
                UserId = CurrentUserId,
                Endpoint = request.Endpoint,
                P256dh = request.P256dh,
                Auth = request.Auth,
                CreatedAt = DateTime.UtcNow
            });
        }

        await _db.SaveChangesAsync();
        return NoContent();
    }

    [HttpPost("unsubscribe")]
    public async Task<IActionResult> Unsubscribe([FromBody] PushSubscribeRequest request)
    {
        var existing = await _db.PushSubscriptions.FirstOrDefaultAsync(p => p.Endpoint == request.Endpoint);
        if (existing is not null)
        {
            _db.PushSubscriptions.Remove(existing);
            await _db.SaveChangesAsync();
        }
        return NoContent();
    }
}
