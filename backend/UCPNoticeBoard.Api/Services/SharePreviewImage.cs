namespace UCPNoticeBoard.Api.Services;

/// <summary>
/// The picture in a shared notice's link preview: the poster fitted whole
/// into the landscape 1200×630 that link previews are made for, on a
/// blurred copy of itself. WhatsApp sizes the message to the picture's
/// shape, so a tall poster as it is makes a narrow message. A JPEG, since
/// WhatsApp skips large or unusual images.
///
/// The blurred backdrop is the poster filled and blurred, with the poster
/// itself laid over it. (Cloudinary's own "b_blurred" padding is rejected
/// on this account with "Invalid color name", which left every preview
/// without a picture.) A poster whose address can't be read that way is
/// padded with its main colour instead.
/// </summary>
public static class SharePreviewImage
{
    private const string Marker = "/upload/";
    private const string PlainTransform = "w_1200,h_630,c_pad,b_auto,q_auto,f_jpg/";

    // v1234/folder/name.jpg: the version, then the public id, then the format.
    private static readonly System.Text.RegularExpressions.Regex Stored =
        new(@"^v\d+/(?<id>[^,]+)\.[A-Za-z0-9]+$");

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(60) };

    /// <summary>The preview copy of a Cloudinary poster, or null for any other picture.</summary>
    public static string? ForCloudinary(string? imageUrl)
    {
        if (string.IsNullOrWhiteSpace(imageUrl) || !imageUrl.Contains("res.cloudinary.com")) return null;
        var at = imageUrl.IndexOf(Marker, StringComparison.Ordinal);
        if (at < 0) return null;
        var start = at + Marker.Length;
        var match = Stored.Match(imageUrl[start..]);
        if (!match.Success) return imageUrl.Insert(start, PlainTransform);
        // In a layer, folders in the public id are separated by colons.
        var layerId = match.Groups["id"].Value.Replace('/', ':');
        return imageUrl.Insert(start,
            "w_1200,h_630,c_fill,e_blur:2000/" +
            $"l_{layerId},w_1200,h_630,c_fit/fl_layer_apply/" +
            "q_auto,f_jpg/");
    }

    /// <summary>
    /// Cloudinary only makes the preview copy the first time someone asks for
    /// it, and making it can take longer than WhatsApp waits; WhatsApp then
    /// shows the preview with no picture and keeps it that way. Asking once
    /// as soon as the notice is saved means the copy is ready before anyone
    /// shares the link. Best-effort: a failure only means the first share
    /// waits for Cloudinary, as before.
    /// </summary>
    public static void PrepareInBackground(string? imageUrl)
    {
        var previewUrl = ForCloudinary(imageUrl);
        if (previewUrl is null) return;
        _ = Task.Run(async () =>
        {
            try
            {
                using var response = await Http.GetAsync(previewUrl, HttpCompletionOption.ResponseHeadersRead);
            }
            catch
            {
                // Not needed for anything but speed.
            }
        });
    }
}
