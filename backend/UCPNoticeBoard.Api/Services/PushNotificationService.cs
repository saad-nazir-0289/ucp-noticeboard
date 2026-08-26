using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;
using UCPNoticeBoard.Api.Models;
using WebPush;

namespace UCPNoticeBoard.Api.Services;

public interface IPushNotificationService
{
    /// <summary>Sends a notification to every registered device, for every user, regardless of role.</summary>
    Task NotifyAllAsync(string title, string body, string? url = null);
}

/// <summary>
/// Uses standard browser Web Push (VAPID) — no paid third-party service,
/// no per-message cost. Delivery goes through the browser vendors' own
/// push infrastructure (Google/Mozilla/etc.), which is free regardless of
/// volume.
/// </summary>
public class PushNotificationService : IPushNotificationService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _configuration;
    private readonly ILogger<PushNotificationService> _logger;

    public PushNotificationService(AppDbContext db, IConfiguration configuration, ILogger<PushNotificationService> logger)
    {
        _db = db;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task NotifyAllAsync(string title, string body, string? url = null)
    {
        var publicKey = _configuration["VapidSettings:PublicKey"];
        var privateKey = _configuration["VapidSettings:PrivateKey"];
        var subject = _configuration["VapidSettings:Subject"];

        if (string.IsNullOrWhiteSpace(publicKey) || publicKey.StartsWith("REPLACE_WITH") ||
            string.IsNullOrWhiteSpace(privateKey) || privateKey.StartsWith("REPLACE_WITH"))
        {
            // Not configured yet — this is expected before you've generated
            // VAPID keys, and should never block notice creation itself.
            _logger.LogInformation("Push notifications skipped: VAPID keys not configured yet.");
            return;
        }

        var vapidDetails = new VapidDetails(subject, publicKey, privateKey);
        var webPushClient = new WebPushClient();

        var payload = System.Text.Json.JsonSerializer.Serialize(new { title, body, url });
        var subscriptions = await _db.PushSubscriptions.ToListAsync();

        var deadSubscriptionIds = new List<int>();

        foreach (var sub in subscriptions)
        {
            try
            {
                var pushSubscription = new WebPush.PushSubscription(sub.Endpoint, sub.P256dh, sub.Auth);
                await webPushClient.SendNotificationAsync(pushSubscription, payload, vapidDetails);
            }
            catch (WebPushException ex) when (ex.StatusCode is System.Net.HttpStatusCode.NotFound or System.Net.HttpStatusCode.Gone)
            {
                // The browser has permanently unsubscribed (uninstalled,
                // cleared data, etc.) — clean up so we stop trying.
                deadSubscriptionIds.Add(sub.Id);
            }
            catch (Exception ex)
            {
                // One failed device should never stop the rest from being notified.
                _logger.LogWarning(ex, "Failed to send push notification to subscription {Id}", sub.Id);
            }
        }

        if (deadSubscriptionIds.Count > 0)
        {
            var deadSubs = await _db.PushSubscriptions
                .Where(p => deadSubscriptionIds.Contains(p.Id))
                .ToListAsync();
            _db.PushSubscriptions.RemoveRange(deadSubs);
            await _db.SaveChangesAsync();
        }
    }
}
