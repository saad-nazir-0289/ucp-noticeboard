using System.Collections.Concurrent;
using UCPNoticeBoard.Api.Services;

namespace UCPNoticeBoard.Api.Tests.Infrastructure;

/// <summary>Records broadcasts instead of sending real Web Push messages.</summary>
public class FakePushNotificationService : IPushNotificationService
{
    public record SentNotification(string Title, string Body, string? Url, string? ImageUrl, int? CategoryId);

    public ConcurrentQueue<SentNotification> Sent { get; } = new();

    public Task NotifyAllAsync(string title, string body, string? url = null, string? imageUrl = null, int? categoryId = null)
    {
        Sent.Enqueue(new SentNotification(title, body, url, imageUrl, categoryId));
        return Task.CompletedTask;
    }
}
