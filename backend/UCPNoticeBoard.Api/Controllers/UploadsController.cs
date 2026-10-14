using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace UCPNoticeBoard.Api.Controllers;

public record UploadSignatureResponse(string Signature, long Timestamp, string ApiKey, string CloudName);

[ApiController]
[Route("uploads")]
[Authorize(Roles = "Publisher,Admin")]
public class UploadsController : ControllerBase
{
    private readonly IConfiguration _configuration;

    public UploadsController(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    /// <summary>
    /// Cloudinary's real API Secret NEVER leaves this server — it's only
    /// used here, briefly, to compute a signature for THIS ONE upload
    /// request. The browser gets the signature, not the secret, so it
    /// can prove to Cloudinary "this upload was authorized by the real
    /// backend" without ever holding anything that could be reused by
    /// someone else. Only Publisher/Admin (already enforced above) can
    /// even reach this endpoint — unlike an unsigned upload preset,
    /// which anyone who finds the Cloud Name and preset name in the
    /// published extension's code could use to upload to this account
    /// with no authentication at all.
    /// </summary>
    [HttpGet("signature")]
    public ActionResult<UploadSignatureResponse> GetUploadSignature()
    {
        var cloudName = _configuration["Cloudinary:CloudName"];
        var apiKey = _configuration["Cloudinary:ApiKey"];
        var apiSecret = _configuration["Cloudinary:ApiSecret"];

        if (string.IsNullOrWhiteSpace(cloudName) || cloudName.StartsWith("REPLACE_WITH") ||
            string.IsNullOrWhiteSpace(apiKey) || apiKey.StartsWith("REPLACE_WITH") ||
            string.IsNullOrWhiteSpace(apiSecret) || apiSecret.StartsWith("REPLACE_WITH"))
        {
            return StatusCode(503, "Image uploads are not set up yet.");
        }

        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        // Cloudinary's signing rule: sort every parameter you'll send
        // (except file/api_key/cloud_name) alphabetically by key, join as
        // key=value pairs, append the API secret directly, then SHA-1 hash
        // the result. "timestamp" is the only parameter being sent.
        var stringToSign = $"timestamp={timestamp}{apiSecret}";
        var hash = SHA1.HashData(Encoding.UTF8.GetBytes(stringToSign));
        var signature = Convert.ToHexString(hash).ToLowerInvariant();

        return Ok(new UploadSignatureResponse(signature, timestamp, apiKey, cloudName));
    }
}
