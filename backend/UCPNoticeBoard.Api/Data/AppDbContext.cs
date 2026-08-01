using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Notice> Notices => Set<Notice>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<NoticeDismissal> NoticeDismissals => Set<NoticeDismissal>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(u => u.RollNumber).IsUnique();
            entity.Property(u => u.Name).IsRequired().HasMaxLength(200);
            entity.Property(u => u.RollNumber).IsRequired().HasMaxLength(40);
            entity.Property(u => u.Role).HasConversion<string>().HasMaxLength(20);
            entity.Property(u => u.PendingActivationCode).HasMaxLength(40);
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.HasIndex(c => c.Name).IsUnique();
            entity.Property(c => c.Name).IsRequired().HasMaxLength(100);
        });

        modelBuilder.Entity<Notice>(entity =>
        {
            entity.Property(n => n.Title).IsRequired().HasMaxLength(200);
            entity.Property(n => n.Description).IsRequired().HasMaxLength(4000);
            entity.Property(n => n.ImageUrl).HasMaxLength(1000);
            entity.Property(n => n.LinkUrl).HasMaxLength(1000);

            entity.HasOne(n => n.CreatedByUser)
                  .WithMany(u => u.Notices)
                  .HasForeignKey(n => n.CreatedByUserId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(n => n.Category)
                  .WithMany(c => c.Notices)
                  .HasForeignKey(n => n.CategoryId)
                  .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<NoticeDismissal>(entity =>
        {
            // A user can only dismiss a given notice once — re-dismissing
            // is just a no-op, not a duplicate row.
            entity.HasIndex(d => new { d.UserId, d.NoticeId }).IsUnique();
        });
    }
}
