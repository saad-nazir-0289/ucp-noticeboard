namespace UCPNoticeBoard.Api.Services;

/// <summary>
/// The picture in a shared notice's link preview: the poster fitted whole
/// into the landscape 1200×630 that link previews are made for, on a
/// blurred copy of itself. WhatsApp sizes the message to the picture's
/// shape, so a tall poster as it is makes a narrow message. A JPEG, since
/// WhatsApp skips large or unusual images.
/// </summary>
public static class SharePreviewImage
{
    private const string Marker = "/upload/";
    private const string Transform = "w_1200,h_630,c_pad,b_blurred:400:15,q_auto,f_jpg/";

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(60) };

    /// <summary>The preview copy of a Cloudinary poster, or null for any other picture.</summary>
    public static string? ForCloudinary(string? imageUrl)
    {
        if (string.IsNullOrWhiteSpace(imageUrl) || !imageUrl.Contains("res.cloudinary.com")) return null;
        var at = imageUrl.IndexOf(Marker, StringComparison.Ordinal);
        return at < 0 ? null : imageUrl.Insert(at + Marker.Length, Transform);
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
