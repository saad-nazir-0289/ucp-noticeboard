using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;

namespace UCPNoticeBoard.Api.Services;

/// <summary>
/// Runs continuously alongside the API in the same process — no separate
/// worker, no external scheduler, no added cost. This is the first thing
/// in the project that runs on a timer rather than in response to a
/// request, which is worth knowing if this is ever scaled to multiple
/// backend instances: with more than one instance, each would run this
/// loop independently and could send duplicate reminders. Harmless at
/// today's single-instance scale, but not something to forget about if
/// that ever changes — the fix at that point would be moving this to a
/// single dedicated worker rather than running it in every instance.
/// </summary>
public class DeadlineReminderService : BackgroundService
{
    private static readonly TimeSpan CheckInterval = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan ReminderWindow = TimeSpan.FromHours(24);
    /// <summary>
    /// The "new notice" push comes first and stays on its own for at least
    /// this long: the reminder replaces it on the phone (same notification),
    /// so one sent minutes after posting would hide the notice itself.
    /// </summary>
    public static readonly TimeSpan QuietAfterPosting = TimeSpan.FromHours(6);

    /// <summary>
    /// Due once the deadline is less than a day away, but never within
    /// <see cref="QuietAfterPosting"/> of the notice going up. A notice posted
    /// with only a few hours left gets just its "new notice" push.
    /// </summary>
    public static bool IsReminderDue(DateTime createdAt, DateTime deadline, DateTime now) =>
        deadline > now && deadline - now <= ReminderWindow && now - createdAt >= QuietAfterPosting;

    /// <summary>"Less than a day left.", "About 5 hours left.", "Less than an hour left."</summary>
    public static string ReminderBody(DateTime deadline, DateTime now)
    {
        var left = deadline - now;
        if (left > TimeSpan.FromHours(20)) return "Less than a day left.";
        if (left < TimeSpan.FromHours(1)) return "Less than an hour left.";
        var hours = (int)Math.Round(left.TotalHours);
        return hours == 1 ? "About an hour left." : $"About {hours} hours left.";
    }

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<DeadlineReminderService> _logger;

    public DeadlineReminderService(IServiceScopeFactory scopeFactory, ILogger<DeadlineReminderService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // A short initial delay so this doesn't compete with the app's
        // own startup (migrations, etc.) for the first few seconds.
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SendDueRemindersAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                // A failure here should never crash the whole background
                // service — just log it and try again on the next tick.
                _logger.LogError(ex, "Deadline reminder check failed.");
            }

            await Task.Delay(CheckInterval, stoppingToken);
        }
    }

    private async Task SendDueRemindersAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var pushService = scope.ServiceProvider.GetRequiredService<IPushNotificationService>();

        var now = DateTime.UtcNow;
        var windowEnd = now + ReminderWindow;

        // Notices whose deadline falls within the next 24 hours, haven't
        // already been reminded about, haven't passed yet, and went up at
        // least QuietAfterPosting ago (the same rule as IsReminderDue).
        var quietUntil = now - QuietAfterPosting;
        var dueNotices = await db.Notices
            .Where(n => n.Deadline != null
                        && n.Deadline > now
                        && n.Deadline <= windowEnd
                        && n.CreatedAt <= quietUntil
                        && !n.ReminderSent)
            .ToListAsync(cancellationToken);

        foreach (var notice in dueNotices)
        {
            try
            {
                await pushService.NotifyAllAsync(
                    $"Deadline soon: {notice.Title}",
                    ReminderBody(notice.Deadline!.Value, now),
                    url: Controllers.NoticesController.NoticeLink(notice.Id),
                    imageUrl: notice.ImageUrl,
                    categoryId: notice.CategoryId
                );

                notice.ReminderSent = true;
            }
            catch (Exception ex)
            {
                // Leave ReminderSent false on failure so this notice gets
                // retried on the next tick rather than silently skipped.
                _logger.LogWarning(ex, "Failed to send deadline reminder for notice {Id}", notice.Id);
            }
        }

        if (dueNotices.Count > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}
