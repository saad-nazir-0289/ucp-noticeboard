using System.Security.Cryptography;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Services;

namespace UCPNoticeBoard.Api.Controllers;

[ApiController]
[Route("/")]
public class AuthController : ControllerBase
{
    // Same shape the extension scrapes off the portal and the PWA
    // validates on entry — enforced here too, so a request that bypasses
    // both clients entirely can't create a permanent database row for an
    // arbitrary string.
    private static readonly Regex RollNumberFormat =
        new(@"^[A-Za-z]{1,2}\d[A-Za-z]\d{2}[A-Za-z]{2,8}\d{3,6}$", RegexOptions.Compiled);

    private readonly AppDbContext _db;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IConfiguration _configuration;
    private readonly INoticeQueryService _noticeQuery;
    private readonly IPinService _pins;

    public AuthController(
        AppDbContext db,
        IJwtTokenService jwtTokenService,
        IConfiguration configuration,
        INoticeQueryService noticeQuery,
        IPinService pins)
    {
        _pins = pins;
        _db = db;
        _jwtTokenService = jwtTokenService;
        _configuration = configuration;
        _noticeQuery = noticeQuery;
    }

    /// <summary>
    /// There is no password or OAuth step here on purpose: the student is
    /// already authenticated by the UCP portal itself, and the extension
    /// reads the Roll Number the portal displays.
    ///
    /// Role is granted directly from what's stored for this account — a
    /// Publisher/Admin's tabs and tools are visible on ANY device with
    /// zero extra steps, since the Roll Number carrying that role is
    /// itself already known (Publishers/Admins aren't anonymous here).
    /// The actual security boundary for anything that changes public
    /// content — creating, editing, or deleting a notice — is the PIN
    /// checked in NoticesController, not anything checked here.
    ///
    /// ActivationCode remains relevant for exactly two one-time events:
    /// claiming the very first Admin account (via the AdminActivationSecret
    /// config value, only while zero Admins exist), and a brand-new
    /// Publisher's first-ever claim of their role. Both are single-use —
    /// once redeemed, the code is cleared and never checked again.
    /// </summary>
    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RollNumber))
        {
            return BadRequest("rollNumber is required.");
        }

        var rollNumber = request.RollNumber.Trim().ToUpperInvariant();

        if (!RollNumberFormat.IsMatch(rollNumber))
        {
            return BadRequest("rollNumber is not in a valid format.");
        }

        var suppliedCode = string.IsNullOrWhiteSpace(request.ActivationCode)
            ? null
            : request.ActivationCode.Trim();

        var user = await _db.Users.FirstOrDefaultAsync(u => u.RollNumber == rollNumber);
        var needsSave = false;

        if (user is null)
        {
            user = new User
            {
                Name = string.IsNullOrWhiteSpace(request.Name) ? rollNumber : request.Name.Trim(),
                RollNumber = rollNumber,
                Role = UserRole.Student,
                CreatedAt = DateTime.UtcNow
            };
            _db.Users.Add(user);
            needsSave = true;
        }

        if (suppliedCode is not null)
        {
            var adminSecret = _configuration["AdminActivationSecret"]?.Trim();
            var isAdminBootstrap = !string.IsNullOrWhiteSpace(adminSecret) && suppliedCode == adminSecret;

            if (isAdminBootstrap)
            {
                var anyAdminExists = await _db.Users.AnyAsync(u => u.Role == UserRole.Admin);
                if (!anyAdminExists && user.Role != UserRole.Admin)
                {
                    user.Role = UserRole.Admin;
                    user.SecurityStamp = Guid.NewGuid().ToString("N");
                    needsSave = true;
                }
                else if (user.Role == UserRole.Admin)
                {
                    // Recovery path for a genuinely forgotten PIN: only
                    // reachable by someone who has BOTH this Roll Number
                    // AND the real AdminActivationSecret from Railway's
                    // config — the same bar as claiming Admin in the
                    // first place, not just knowing a Roll Number. Clears
                    // the PIN and any lockout (this is also how the Admin
                    // gets back in if someone locked their account by
                    // guessing), and logs out every unlocked device; their
                    // next privileged action sets a fresh PIN, same as
                    // first use.
                    _pins.ClearPin(user);
                    user.SecurityStamp = Guid.NewGuid().ToString("N");
                    await _pins.RevokeDevicesAsync(user.Id);
                    needsSave = true;
                }
            }
            else if (user.Role == UserRole.Student
                     && user.PrivilegedCredential is not null
                     && suppliedCode == user.PrivilegedCredential)
            {
                user.Role = UserRole.Publisher;
                user.SecurityStamp = Guid.NewGuid().ToString("N");
                user.PrivilegedCredential = null; // one-time — cleared once redeemed
                needsSave = true;
            }
        }

        if (needsSave)
        {
            await _db.SaveChangesAsync();
        }

        var token = _jwtTokenService.CreateToken(user, user.Role);

        var notices = await _noticeQuery.GetActiveNoticesAsync(user.Id, includeDismissed: false, includeViews: user.Role == UserRole.Admin);
        var categories = await _noticeQuery.GetCategoriesAsync();

        return Ok(new LoginResponse(user.Id, user.Name, user.RollNumber, user.Role.ToString(), token, notices, categories, user.LogoUrl));
    }
}
