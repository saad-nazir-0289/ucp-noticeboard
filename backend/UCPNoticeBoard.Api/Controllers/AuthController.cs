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
    /// already authenticated by the UCP portal itself. The extension reads
    /// the Roll Number that the portal displays on the dashboard and sends
    /// it here. We trust it for the same reason the portal does — it's only
    /// reachable from inside an already-logged-in portal session.
    /// If the Roll Number has never been seen before, a Student account is
    /// created automatically (unless it matches the seeded Admin Roll
    /// Number). Publisher access is granted later, manually, by the Admin.
    /// </summary>
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.RollNumber))
        {
            return BadRequest("rollNumber is required.");
        }

        var rollNumber = request.RollNumber.Trim().ToUpperInvariant();
        var initialAdminRollNumber = _configuration["InitialAdminRollNumber"]?.Trim().ToUpperInvariant();
        var isSeededAdmin = !string.IsNullOrWhiteSpace(initialAdminRollNumber) && rollNumber == initialAdminRollNumber;

        var user = await _db.Users.FirstOrDefaultAsync(u => u.RollNumber == rollNumber);

        if (user is null)
        {
            user = new User
            {
                Name = string.IsNullOrWhiteSpace(request.Name) ? rollNumber : request.Name.Trim(),
                RollNumber = rollNumber,
                Role = isSeededAdmin ? UserRole.Admin : UserRole.Student,
                CreatedAt = DateTime.UtcNow
            };
            _db.Users.Add(user);
            await _db.SaveChangesAsync();
        }
        else
        {
            var needsSave = false;

            if (!string.IsNullOrWhiteSpace(request.Name) && user.Name != request.Name.Trim())
            {
                // Keep the display name in sync with the portal in case it changes.
                user.Name = request.Name.Trim();
                needsSave = true;
            }

            // Self-healing: whoever is configured as InitialAdminRollNumber is
            // always Admin, even if their account already existed (e.g. from
            // earlier testing, before this config value was set correctly).
            // This is checked on every login, not just at account creation.
            if (isSeededAdmin && user.Role != UserRole.Admin)
            {
                user.Role = UserRole.Admin;
                needsSave = true;
            }

            if (needsSave)
            {
                await _db.SaveChangesAsync();
            }
        }

        var token = _jwtTokenService.CreateToken(user);

        return Ok(new LoginResponse(user.Id, user.Name, user.RollNumber, user.Role.ToString(), token));
    }
}
