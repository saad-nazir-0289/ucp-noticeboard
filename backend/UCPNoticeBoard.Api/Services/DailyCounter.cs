using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Data;

namespace UCPNoticeBoard.Api.Services;

/// <summary>
/// Adds to the day's totals (see Models/DailyCount.cs). Pakistan time, so a
/// "day" and an "hour" match the students' own clock.
/// </summary>
public static class DailyCounter
{
    public static readonly TimeSpan PakistanOffset = TimeSpan.FromHours(5);

    public static DateTime ToPakistan(DateTime utc) => utc + PakistanOffset;
    public static DateOnly PakistanDay(DateTime utc) => DateOnly.FromDateTime(ToPakistan(utc));

    /// <summary>Adds one to each metric for the day of <paramref name="utc"/>, in one statement each.</summary>
    public static async Task AddAsync(AppDbContext db, DateTime utc, params string[] metrics)
    {
        var day = PakistanDay(utc);
        foreach (var metric in metrics.Distinct())
        {
            await db.Database.ExecuteSqlInterpolatedAsync($@"
                INSERT INTO ""DailyCounts"" (""Day"", ""Metric"", ""Count"") VALUES ({day}, {metric}, 1)
                ON CONFLICT (""Day"", ""Metric"") DO UPDATE SET ""Count"" = ""DailyCounts"".""Count"" + 1");
        }
    }
}
