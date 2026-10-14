using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Services;

namespace UCPNoticeBoard.Api.Controllers;

/// <summary>Publishers (and the Admin) managing their own public profile.</summary>
[ApiController]
[Route("profile")]
[Authorize(Roles = "Publisher,Admin")]
public class ProfileController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IPinService _pins;
    private readonly INoticeQueryService _noticeQuery;

    public ProfileController(AppDbContext db, IPinService pins, INoticeQueryService noticeQuery)
    {
        _db = db;
        _pins = pins;
        _noticeQuery = noticeQuery;
    }

    private int CurrentUserId =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub")!);

    /// <summary>
    /// Sets or clears the caller's logo, shown on their notices. Guarded
    /// like publishing, since it changes what students see.
    /// </summary>
    [HttpPut("logo")]
    [EnableRateLimiting("pin-check")]
    public async Task<IActionResult> UpdateLogo([FromBody] UpdateLogoRequest request)
    {
        if (!LogoRules.TryNormalize(request.LogoUrl, out var logoUrl, out var problem))
        {
            return BadRequest(problem);
        }

        var user = await _db.Users.FindAsync(CurrentUserId);
        if (user is null) return Unauthorized();

        var pinCheck = await _pins.AuthorizeAsync(user, request.Pin);
        if (!pinCheck.Succeeded) return pinCheck.ToActionResult();

        user.LogoUrl = logoUrl;
        await _db.SaveChangesAsync();
        _noticeQuery.InvalidateNoticesCache();

        return Ok(new { logoUrl });
    }
}
