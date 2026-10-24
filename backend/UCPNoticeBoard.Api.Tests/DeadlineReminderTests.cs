using UCPNoticeBoard.Api.Services;

namespace UCPNoticeBoard.Api.Tests;

public class DeadlineReminderTests
{
    private static readonly DateTime Now = new(2026, 10, 15, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void PostedWithLessThanADayLeft_NoReminderRightAway()
    {
        // Posted 10 minutes ago, deadline tonight: only the "new notice" push.
        Assert.False(DeadlineReminderService.IsReminderDue(Now.AddMinutes(-10), Now.AddHours(8), Now));
    }

    [Fact]
    public void PostedDaysAgo_RemindedOnceLessThanADayIsLeft()
    {
        var created = Now.AddDays(-3);
        Assert.False(DeadlineReminderService.IsReminderDue(created, Now.AddHours(30), Now));
        Assert.True(DeadlineReminderService.IsReminderDue(created, Now.AddHours(23), Now));
    }

    [Fact]
    public void PostedHoursBeforeTheDeadline_RemindedAfterTheQuietPeriod()
    {
        var created = Now.AddHours(-6);
        Assert.True(DeadlineReminderService.IsReminderDue(created, Now.AddHours(5), Now));
        Assert.False(DeadlineReminderService.IsReminderDue(created, Now.AddMinutes(-1), Now));
    }

    [Theory]
    [InlineData(23, "Less than a day left.")]
    [InlineData(5, "About 5 hours left.")]
    [InlineData(1, "About an hour left.")]
    public void ReminderSaysHowLongIsLeft(int hoursLeft, string expected)
    {
        Assert.Equal(expected, DeadlineReminderService.ReminderBody(Now.AddHours(hoursLeft), Now));
    }

    [Fact]
    public void ReminderInTheLastHour()
    {
        Assert.Equal("Less than an hour left.", DeadlineReminderService.ReminderBody(Now.AddMinutes(40), Now));
    }

    [Fact]
    public void LastCall_InTheFinalHalfHour()
    {
        var created = Now.AddDays(-2);
        Assert.False(DeadlineReminderService.IsLastCallDue(created, Now.AddMinutes(45), Now));
        Assert.True(DeadlineReminderService.IsLastCallDue(created, Now.AddMinutes(28), Now));
        Assert.False(DeadlineReminderService.IsLastCallDue(created, Now.AddMinutes(-1), Now));
    }

    [Fact]
    public void LastCall_NotForANoticeJustPosted()
    {
        // Its "new notice" push went out 20 minutes ago.
        Assert.False(DeadlineReminderService.IsLastCallDue(Now.AddMinutes(-20), Now.AddMinutes(25), Now));
    }

    [Fact]
    public void LastCall_TakesOverFromTheDayBeforeReminder()
    {
        // In the final half hour only the last call is due, never both.
        var created = Now.AddHours(-7);
        Assert.False(DeadlineReminderService.IsReminderDue(created, Now.AddMinutes(20), Now));
        Assert.True(DeadlineReminderService.IsLastCallDue(created, Now.AddMinutes(20), Now));
    }

    [Fact]
    public void LastCallSaysWhenItCloses()
    {
        // 18:59 UTC is 11:59 PM in Pakistan.
        var deadline = new DateTime(2026, 10, 24, 18, 59, 0, DateTimeKind.Utc);
        Assert.Equal("About 25 minutes left. Closes at 11:59 PM.", DeadlineReminderService.LastCallBody(deadline, deadline.AddMinutes(-26)));
    }
}
