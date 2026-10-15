using System.Net;
using System.Net.Http.Json;
using UCPNoticeBoard.Api.Models;
using UCPNoticeBoard.Api.Tests.Infrastructure;

namespace UCPNoticeBoard.Api.Tests;

public class NoticeTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _api;

    public NoticeTests(ApiFactory api) => _api = api;

    private static CreateNoticeRequest NewNotice(string pin, string title = "Test notice", DateTime? deadline = null) =>
        new(title, "Some description", null, null, null, deadline, pin);

    [Fact]
    public async Task Student_CannotCreateNotice()
    {
        var student = await _api.LoginStudentAsync();
        using var client = _api.CreateApiClient(student.Token);

        var response = await client.PostAsJsonAsync("/notices", NewNotice("1234"));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Publisher_FirstPinBecomesTheirPin()
    {
        var publisher = await _api.CreatePublisherAsync();
        using var client = _api.CreateApiClient(publisher.Token);

        var first = await client.PostAsJsonAsync("/notices", NewNotice("1111"));
        var wrongPin = await client.PostAsJsonAsync("/notices", NewNotice("2222"));
        var rightPin = await client.PostAsJsonAsync("/notices", NewNotice("1111"));

        Assert.Equal(HttpStatusCode.Created, first.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, wrongPin.StatusCode);
        Assert.Equal(HttpStatusCode.Created, rightPin.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("123")]
    [InlineData("1234567")]
    [InlineData("abcd")]
    public async Task CreateNotice_RejectsMalformedPin(string pin)
    {
        var publisher = await _api.CreatePublisherAsync();
        using var client = _api.CreateApiClient(publisher.Token);

        var response = await client.PostAsJsonAsync("/notices", NewNotice(pin));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Publisher_CannotEditOrDeleteAnotherPublishersNotice()
    {
        var owner = await _api.CreatePublisherAsync();
        var other = await _api.CreatePublisherAsync();

        using var ownerClient = _api.CreateApiClient(owner.Token);
        var created = await ownerClient.PostAsJsonAsync("/notices", NewNotice("1111"));
        var notice = (await created.Content.ReadFromJsonAsync<NoticeDto>())!;

        using var otherClient = _api.CreateApiClient(other.Token);
        var edit = await otherClient.PutAsJsonAsync(
            $"/notices/{notice.Id}",
            new UpdateNoticeRequest("Hijacked", "x", null, null, null, null, "2222"));
        var delete = await otherClient.DeleteAsync($"/notices/{notice.Id}?pin=2222");

        Assert.Equal(HttpStatusCode.Forbidden, edit.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, delete.StatusCode);
    }

    [Fact]
    public async Task Publisher_DeletesSeveralOwnNoticesAtOnce()
    {
        var publisher = await _api.CreatePublisherAsync();
        using var client = _api.CreateApiClient(publisher.Token);
        var ids = new List<int>();
        for (var i = 0; i < 3; i++)
        {
            var created = await client.PostAsJsonAsync("/notices", NewNotice("1111", $"Batch {i}"));
            ids.Add((await created.Content.ReadFromJsonAsync<NoticeDto>())!.Id);
        }

        var wrongPin = await client.PostAsJsonAsync("/notices/delete", new DeleteNoticesRequest(ids.Take(2).ToList(), "2222"));
        var response = await client.PostAsJsonAsync("/notices/delete", new DeleteNoticesRequest(ids.Take(2).ToList(), "1111"));

        Assert.Equal(HttpStatusCode.BadRequest, wrongPin.StatusCode);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(2, (await response.Content.ReadFromJsonAsync<DeleteNoticesResponse>())!.Deleted);
        var left = (await client.GetFromJsonAsync<List<NoticeDto>>("/notices?includeDismissed=true&includeExpired=true"))!;
        Assert.DoesNotContain(left, n => n.Id == ids[0] || n.Id == ids[1]);
        Assert.Contains(left, n => n.Id == ids[2]);
    }

    [Fact]
    public async Task BatchDelete_IncludingSomeoneElsesNotice_DeletesNothing()
    {
        var owner = await _api.CreatePublisherAsync();
        var other = await _api.CreatePublisherAsync();
        using var ownerClient = _api.CreateApiClient(owner.Token);
        using var otherClient = _api.CreateApiClient(other.Token);
        var theirs = (await (await ownerClient.PostAsJsonAsync("/notices", NewNotice("1111"))).Content.ReadFromJsonAsync<NoticeDto>())!;
        var mine = (await (await otherClient.PostAsJsonAsync("/notices", NewNotice("2222"))).Content.ReadFromJsonAsync<NoticeDto>())!;

        var response = await otherClient.PostAsJsonAsync("/notices/delete", new DeleteNoticesRequest(new List<int> { mine.Id, theirs.Id }, "2222"));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var left = (await ownerClient.GetFromJsonAsync<List<NoticeDto>>("/notices?includeDismissed=true&includeExpired=true"))!;
        Assert.Contains(left, n => n.Id == mine.Id);
        Assert.Contains(left, n => n.Id == theirs.Id);
    }

    [Fact]
    public async Task ExpiredNotice_HiddenFromStudents_VisibleInManagementView()
    {
        var publisher = await _api.CreatePublisherAsync();
        using var publisherClient = _api.CreateApiClient(publisher.Token);
        var title = $"Expired {Guid.NewGuid():N}";
        var created = await publisherClient.PostAsJsonAsync(
            "/notices", NewNotice("1111", title, deadline: DateTime.UtcNow.AddDays(-1)));
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        var student = await _api.LoginStudentAsync();
        using var studentClient = _api.CreateApiClient(student.Token);
        var studentFeed = await studentClient.GetFromJsonAsync<List<NoticeDto>>("/notices?includeExpired=true");
        var managementFeed = await publisherClient.GetFromJsonAsync<List<NoticeDto>>("/notices?includeExpired=true");

        Assert.DoesNotContain(studentFeed!, n => n.Title == title);
        Assert.Contains(managementFeed!, n => n.Title == title);
    }

    [Fact]
    public async Task CreateNotice_BroadcastsPushNotification()
    {
        var publisher = await _api.CreatePublisherAsync();
        using var client = _api.CreateApiClient(publisher.Token);
        var title = $"Push {Guid.NewGuid():N}";

        var response = await client.PostAsJsonAsync("/notices", NewNotice("1111", title));
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        // The broadcast is fire-and-forget after the response is sent.
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (!_api.Push.Sent.Any(n => n.Title == title) && DateTime.UtcNow < deadline)
        {
            await Task.Delay(50);
        }
        var sent = Assert.Single(_api.Push.Sent, n => n.Title == title);
        // Tapping the notification opens this notice in the PWA.
        var notice = (await response.Content.ReadFromJsonAsync<NoticeDto>())!;
        Assert.Equal($"/?notice={notice.Id}", sent.Url);
    }
}
