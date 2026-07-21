using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Services;

namespace UCPNoticeBoard.Api.Controllers;

[ApiController]
[Route("/")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IConfiguration _configuration;

    public AuthController(AppDbContext db, IJwtTokenService jwtTokenService, IConfiguration configuration)
    {
        _db = db;
        _jwtTokenService = jwtTokenService;
        _configuration = configuration;
    }

    /// <summary>
    /// There is no password or OAuth step here on purpose: the student is
    /// already authenticated by the UCP portal itself, and the extension
    /// reads the Roll Number the portal displays. That alone only ever
    /// grants Student (read-only) access — Roll Numbers are visible,
    /// guessable/enumerable, and not something the backend can verify on
    /// its own, so they are NOT trusted for anything beyond that.
    ///
    /// Publisher and Admin access both additionally require an
    /// ActivationCode that isn't derivable from the Roll Number:
    ///   - Publisher: a random code the Admin generates when adding that
    ///     Roll Number, shared with that person out-of-band. Redeeming it
    ///     here upgrades their account, one time, then it's cleared.
    ///   - Admin: a long secret configured only in server config
    ///     (AdminActivationSecret), and only usable once — the very first
    ///     time, before any Admin account exists at all.
    /// </summary>
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RollNumber))
        {
            return BadRequest("rollNumber is required.");
        }

        var rollNumber = request.RollNumber.Trim().ToUpperInvariant();
        var activationCode = string.IsNullOrWhiteSpace(request.ActivationCode)
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
        else if (!string.IsNullOrWhiteSpace(request.Name) && user.Name != request.Name.Trim())
        {
            // Keep the display name in sync with the portal in case it changes.
            user.Name = request.Name.Trim();
            needsSave = true;
        }

        if (activationCode is not null)
        {
            var adminSecret = _configuration["AdminActivationSecret"]?.Trim();
            var isAdminClaim = !string.IsNullOrWhiteSpace(adminSecret) && activationCode == adminSecret;

            if (isAdminClaim)
            {
                // Only ever works ONCE — the very first Admin claim. After
                // that, this secret is permanently inert, even if it later
                // leaks. Further Admins must be promoted by an existing
                // Admin via Manage Users.
                var anyAdminExists = await _db.Users.AnyAsync(u => u.Role == UserRole.Admin);
                if (!anyAdminExists && user.Role != UserRole.Admin)
                {
                    user.Role = UserRole.Admin;
                    needsSave = true;
                }
            }
            else if (user.PendingActivationCode is not null && activationCode == user.PendingActivationCode)
            {
                user.Role = UserRole.Publisher;
                user.PendingActivationCode = null;
                needsSave = true;
            }
        }

        if (needsSave)
        {
            await _db.SaveChangesAsync();
        }

        var token = _jwtTokenService.CreateToken(user);

        return Ok(new LoginResponse(user.Id, user.Name, user.RollNumber, user.Role.ToString(), token));
    }
}
