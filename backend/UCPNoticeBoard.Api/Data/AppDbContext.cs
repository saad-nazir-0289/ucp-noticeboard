using Microsoft.EntityFrameworkCore;
using UCPNoticeBoard.Api.Models;

namespace UCPNoticeBoard.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<User> Users => Set<User>();
    public DbSet<Notice> Notices => Set<Notice>();

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

        modelBuilder.Entity<Notice>(entity =>
        {
            entity.Property(n => n.Title).IsRequired().HasMaxLength(200);
            entity.Property(n => n.Description).IsRequired().HasMaxLength(4000);
            entity.Property(n => n.ImageUrl).HasMaxLength(1000);

            entity.HasOne(n => n.CreatedByUser)
                  .WithMany(u => u.Notices)
                  .HasForeignKey(n => n.CreatedByUserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
