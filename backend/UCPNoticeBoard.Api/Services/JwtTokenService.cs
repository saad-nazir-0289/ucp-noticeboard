using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Services;

public interface IJwtTokenService
{
    // roleToGrant is explicit and separate from user.Role on purpose — the
    // caller (AuthController) decides what role this specific token
    // actually carries, which may be lower than what's stored in the
    // database (e.g. a Publisher who didn't supply their ongoing
    // credential this time only ever gets a Student-level token).
    string CreateToken(User user, UserRole roleToGrant);
}

public class JwtTokenService : IJwtTokenService
{
    private readonly IConfiguration _configuration;

    public JwtTokenService(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    public string CreateToken(User user, UserRole roleToGrant)
    {
        var jwtSettings = _configuration.GetSection("Jwt");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings["Key"]!));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim("rollNumber", user.RollNumber),
            new Claim("name", user.Name),
            new Claim(ClaimTypes.Role, roleToGrant.ToString()),
            // Checked against the live database value on every privileged
            // request — see the middleware in Program.cs. Lets a role
            // change take effect immediately instead of waiting for this
            // token to naturally expire.
            new Claim("stamp", user.SecurityStamp ?? string.Empty),
        };

        var token = new JwtSecurityToken(
            issuer: jwtSettings["Issuer"],
            audience: jwtSettings["Audience"],
            claims: claims,
            // Short-lived on purpose: neither the extension nor the PWA
            // cache a session across page loads (both re-identify fresh
            // every time), so a short expiry costs nothing in normal use —
            // it only shrinks the window a leaked or replayed token would
            // stay valid for.
            expires: DateTime.UtcNow.AddHours(24),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
